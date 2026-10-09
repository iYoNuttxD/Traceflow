import dotenv from 'dotenv';
import { Prisma } from '@prisma/client';
import { mkdir, readFile, writeFile, rename, open, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  HOMOLOGATION_PREFIX as PREFIX,
  fingerprint,
  validateHomologationEnvironment,
  validateHomologationProject,
  installHomologationClock,
  homologationDates
} from './lib/indicators-homologation.js';

export async function runHomologationSeed(
  options,
  { prisma, env = process.env, log = console.log } = {}
) {
  const target = validateHomologationEnvironment(env, options);
  const { projectId, actorId, completeSprintId, activateSprintId } = options;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  const membership = await prisma.projectMembership.findUnique({
    where: { projectId_userId: { projectId, userId: actorId } },
    include: { user: true }
  });
  validateHomologationProject(project, options, membership);
  const [server] = await prisma.$queryRaw`SELECT DATABASE() AS schemaName, @@read_only AS readOnly`;
  if (server.schemaName !== target.database || Number(server.readOnly) !== 0)
    throw Error('Servidor/schema não permite a operação local confirmada.');
  const sprints = await prisma.sprint.findMany({ where: { projectId }, orderBy: { id: 'asc' } });
  const active = sprints.find((s) => s.id === completeSprintId),
    next = sprints.find((s) => s.id === activateSprintId);
  if (!active || !next) throw Error('Sprints explícitas precisam pertencer ao projeto.');
  const day = homologationDates(options.anchor);
  const historicWindows = [
    [-43, -36],
    [-35, -28]
  ];
  for (const [start, end] of historicWindows)
    if (
      sprints.some(
        (s) =>
          !s.deletedAt &&
          s.status !== 'CANCELADA' &&
          !s.name.startsWith(PREFIX) &&
          day(start) < s.endDate &&
          s.startDate < day(end)
      )
    )
      throw Error('Não há intervalo livre para as Sprints históricas do roteiro.');
  const reference = await prisma.commit.findFirst({
    where: { projectId, date: { lte: day(-44) } },
    orderBy: { date: 'desc' }
  });
  if (!reference)
    throw Error(
      'É necessário commit já sincronizado anterior ao início do roteiro; não serão fabricados artefatos GitHub.'
    );
  const file = resolve(options.journalPath ?? `.local/indicators-homologation-${projectId}.json`);
  let journal;
  try {
    journal = JSON.parse(await readFile(file, 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  const identity = {
    version: 1,
    target,
    projectId,
    actorId,
    completeSprintId,
    activateSprintId,
    anchor: options.anchor
  };
  if (journal && fingerprint(journal.identity) !== fingerprint(identity))
    throw Error('Journal pertence a outro plano/ambiente.');
  if (!journal && (active.status !== 'EM_ANDAMENTO' || next.status !== 'PLANEJADA'))
    throw Error('Baseline exige Sprint ativa e sucessora planejada explícitas.');
  if (
    !journal &&
    (await prisma.task.count({ where: { projectId, title: { startsWith: PREFIX } } }))
  )
    throw Error(
      'Dataset marcado já existe sem journal: não duplicar; restaure o journal original.'
    );
  const frozen = await prisma.sprintTask.findMany({
    where: { sprint: { projectId }, closedAt: { not: null } },
    orderBy: { id: 'asc' }
  });
  const stats = async () => ({
    tasks: await prisma.task.count({ where: { projectId } }),
    requirements: await prisma.requirement.count({ where: { projectId } }),
    sprints: await prisma.sprint.count({ where: { projectId } }),
    movements: await prisma.taskMovement.count({ where: { projectId } }),
    effort: await prisma.taskTimeEntry.count({ where: { projectId } }),
    cases: await prisma.testCase.count({ where: { projectId } }),
    executions: await prisma.testExecution.count({ where: { projectId } }),
    defects: await prisma.defect.count({ where: { projectId } })
  });
  log(
    JSON.stringify({
      mode: options.apply ? 'apply' : 'dry-run',
      target,
      project: { id: project.id, name: project.name, description: project.description },
      actorId,
      completeSprintId,
      activateSprintId,
      anchor: options.anchor,
      sourceCommitId: reference.id,
      before: await stats()
    })
  );
  if (!options.apply) return { dryRun: true };
  await mkdir(resolve(file, '..'), { recursive: true });
  const lock = await open(`${file}.lock`, 'wx');
  await lock.writeFile(String(process.pid));
  const save = async () => {
    await writeFile(`${file}.tmp`, JSON.stringify(journal, null, 2), { mode: 0o600 });
    await rename(`${file}.tmp`, file);
  };
  let clock;
  try {
    if (!journal) {
      journal = {
        identity,
        before: await stats(),
        frozen: { ids: frozen.map((r) => r.id), hash: fingerprint(frozen) },
        steps: {},
        pending: null
      };
      await save();
    }
    const verifyFrozen = async () => {
      const rows = await prisma.sprintTask.findMany({
        where: { id: { in: journal.frozen.ids } },
        orderBy: { id: 'asc' }
      });
      if (fingerprint(rows) !== journal.frozen.hash)
        throw Error('Histórico congelado preexistente divergiu.');
    };
    await verifyFrozen();
    if (journal.complete) {
      log(JSON.stringify({ idempotentNoOp: true, after: await stats(), frozenUnchanged: true }));
      return journal;
    }
    const [
      { taskService },
      { sprintService },
      { requirementService },
      { testCaseService },
      { testExecutionService },
      { defectService }
    ] = await Promise.all([
      import('../src/modules/tasks/task.service.js'),
      import('../src/modules/sprints/sprint.service.js'),
      import('../src/modules/requirements/requirement.service.js'),
      import('../src/modules/testCases/services/test-case.service.js'),
      import('../src/modules/testCases/services/test-execution.service.js'),
      import('../src/modules/defects/defect.service.js')
    ]);
    clock = installHomologationClock(prisma, Prisma.dmmf.datamodel.models);
    const context = {
      actorUserId: actorId,
      actor: { id: actorId, name: membership.user.name },
      membershipRole: 'OWNER'
    };
    async function step(key, offset, work, { knownId, recover } = {}) {
      if (Object.hasOwn(journal.steps, key)) return journal.steps[key];
      const requestId = `p86b:${projectId}:${key}`;
      if (journal.pending && journal.pending !== key)
        throw Error(`Operação pendente inesperada: ${journal.pending}`);
      if (journal.pending) {
        const audit = await prisma.auditEvent.findFirst({
          where: { projectId, requestId },
          orderBy: { id: 'desc' }
        });
        const recovered = recover
          ? await recover()
          : audit
            ? (knownId ?? Number(audit.resourceId))
            : null;
        if (recovered) {
          journal.steps[key] = recovered;
          journal.pending = null;
          await save();
          return recovered;
        }
        // An explicit domain error can be retried. A process crash without audit
        // is ambiguous: stop instead of duplicating a potentially committed fact.
        if (!journal.failed)
          throw Error(`Etapa ${key} ambígua após interrupção; confira o domínio antes de retomar.`);
      }
      journal.pending = key;
      journal.failed = false;
      await save();
      clock.at(day(offset));
      try {
        const id = await work({ ...context, requestId });
        journal.steps[key] = id ?? knownId ?? true;
        journal.pending = null;
        await save();
        log(`Concluído ${key}`);
        return journal.steps[key];
      } catch (error) {
        journal.failed = true;
        await save();
        throw error;
      }
    }
    const req = [];
    for (let i = 0; i < 4; i++) {
      const title = `${PREFIX} ${['Entrega com evidência e validação', 'Fluxo, reabertura e correção', 'Trabalho em andamento e lacunas de evidência', 'Requisito ainda sem implementação'][i]}`;
      req.push(
        await step(
          `requirement-${i}`,
          -44,
          async () =>
            (
              await requirementService.createRequirement(projectId, {
                title,
                description:
                  'Cenário artificial de homologação analítica; fatos gerados pelo domínio com relógio controlado.'
              })
            ).id,
          {
            recover: async () =>
              (await prisma.requirement.findFirst({ where: { projectId, title } }))?.id
          }
        )
      );
    }
    const historic = [];
    for (let i = 0; i < 2; i++)
      historic.push(
        await step(
          `sprint-${i}`,
          -44,
          async (ctx) =>
            (
              await sprintService.createSprint(
                projectId,
                {
                  name: `${PREFIX} Sprint ${i ? 'B' : 'A'} — histórico analítico`,
                  objective:
                    'Simulação local explícita; validar evolução diária e snapshots íntegros.',
                  startDate: day(historicWindows[i][0]).toISOString(),
                  endDate: day(historicWindows[i][1]).toISOString()
                },
                ctx
              )
            ).id
        )
      );
    const createTask = async (key, offset, requirementId, extra = {}) =>
      step(
        `task-${key}`,
        offset,
        async (ctx) =>
          (
            await taskService.createTask(
              projectId,
              {
                title: `${PREFIX} ${key} — validar entrega, histórico e rastreabilidade com descrição representativa`,
                description:
                  'Dados artificiais P8.6B. Nenhum fato representa produtividade individual.',
                estimatedEffort: 4,
                requirementId,
                responsibleUserId: actorId,
                ...extra
              },
              ctx
            )
          ).id
      );
    const move = async (key, id, offset, status) =>
      step(
        `move-${key}`,
        offset,
        async (ctx) => {
          await taskService.updateTaskStatus(id, status, ctx);
          return id;
        },
        { knownId: id }
      );
    const link = async (key, id, sprintId, offset) =>
      step(
        `scope-${key}`,
        offset,
        async (ctx) => {
          await taskService.linkSprint(id, { sprintId }, ctx);
          return id;
        },
        { knownId: id }
      );
    const effort = async (key, id, offset, hours) =>
      step(
        `effort-${key}`,
        offset,
        async (ctx) =>
          (
            await taskService.createManualTaskTimeEntry(
              id,
              {
                hours,
                occurredAt: day(offset).toISOString(),
                note: 'Homologação artificial P8.6B'
              },
              ctx
            )
          ).entry.id
      );
    const evidence = async (key, id, offset) =>
      step(
        `evidence-${key}`,
        offset,
        async (ctx) => {
          await taskService.linkCommit(id, { commitId: reference.id }, ctx);
          return id;
        },
        { knownId: id }
      );
    const flow = [];
    for (let i = 0; i < 10; i++) {
      const created = i < 3 ? -20 + i : i < 6 ? -14 + (i - 3) : -10;
      const id = await createTask(`Fluxo ${i + 1}`, created, req[i < 7 ? 1 : 2], {
        ...(i === 8 ? { estimatedEffort: null, responsibleUserId: null } : {}),
        deadline: day(i < 8 ? -2 : 6).toISOString()
      });
      flow.push(id);
      await link(`flow-${i}`, id, completeSprintId, Math.max(created, -11));
      if (i !== 8 && i !== 9)
        await move(
          `flow-start-${i}`,
          id,
          i < 3 ? -11 + i : i < 6 ? -11 + (i - 3) : -8,
          'EM_ANDAMENTO'
        );
      if (i < 7) {
        const done = i < 3 ? -10 + i : i < 6 ? -5 + (i - 3) : -4;
        await effort(`flow-${i}`, id, done - 0.1, [2, 4, 7][i % 3]);
        await move(`flow-done-${i}`, id, done, 'CONCLUIDO');
        if (i % 2 === 0) await evidence(`flow-${i}`, id, done);
      }
    }
    await move('reopen', flow[6], -3, 'EM_ANDAMENTO');
    await effort('rework', flow[6], -2.1, 1);
    await move('recomplete', flow[6], -2, 'CONCLUIDO');
    await step(
      'remove-scope',
      -1,
      async (ctx) => {
        await taskService.unlinkSprint(flow[9], ctx);
        return flow[9];
      },
      { knownId: flow[9] }
    );
    await step(
      'estimate-change',
      -6,
      async (ctx) => {
        await taskService.updateTask(flow[7], { estimatedEffort: 6 }, ctx);
        return flow[7];
      },
      { knownId: flow[7] }
    );
    // Quality uses only an existing synchronized commit, never invented GitHub facts.
    const cases = [];
    for (let i = 0; i < 8; i++)
      cases.push(
        await step(
          `case-${i}`,
          -26,
          async (ctx) =>
            (
              await testCaseService.create(
                projectId,
                {
                  title: `${PREFIX} Caso ${i + 1} — validar estados, versões e rastreabilidade`,
                  preconditions: 'Ambiente local de homologação',
                  expectedResult: 'Estado coerente e evidência rastreável',
                  responsibleUserId: actorId,
                  requirementId: req[i === 7 ? 3 : i < 2 ? 0 : i < 6 ? 1 : 2],
                  steps: [
                    {
                      action: 'Executar cenário de homologação',
                      expectedResult: 'Conferir o resultado e registrar evidência'
                    }
                  ]
                },
                ctx
              )
            ).id
        )
      );
    async function execute(key, index, offset, result, retestId) {
      return step(`execution-${key}`, offset, async (ctx) => {
        const tc = await prisma.testCase.findUnique({ where: { id: cases[index] } });
        let retest;
        if (retestId) {
          const d = await prisma.defect.findUnique({ where: { id: retestId } });
          retest = {
            defectId: d.id,
            correctionCycle: d.currentCorrectionCycle,
            expectedRevision: d.revision
          };
        }
        return (
          await testExecutionService.record(
            tc.id,
            {
              testCaseVersion: tc.currentVersion,
              environment: 'HOMOLOGACAO',
              testedReference: { type: 'COMMIT', id: reference.id },
              steps: [
                { position: 1, result, observedResult: `Cenário artificial P8.6B — ${result}` }
              ],
              ...(retest ? { retest } : {})
            },
            null,
            ctx
          )
        ).id;
      });
    }
    for (let i = 0; i < 12; i++)
      await execute(`sample-${i}`, i % 7, -25 + i * 2, ['PASS', 'FAIL', 'BLOCKED', 'PASS'][i % 4]);
    await step(
      'case-version',
      -4,
      async (ctx) => {
        const tc = await prisma.testCase.findUnique({ where: { id: cases[0] } });
        await testCaseService.update(
          tc.id,
          {
            expectedVersion: tc.currentVersion,
            expectedResult: 'Versão revisada: confirmar resultado e comparação temporal.'
          },
          ctx
        );
        return tc.id;
      },
      { knownId: cases[0] }
    );
    await execute('new-version', 0, -2, 'PASS');
    await step(
      'case-inactive',
      -1,
      async (ctx) => {
        const tc = await prisma.testCase.findUnique({ where: { id: cases[1] } });
        await testCaseService.update(
          tc.id,
          { expectedVersion: tc.currentVersion, status: 'INATIVO' },
          ctx
        );
        return tc.id;
      },
      { knownId: cases[1] }
    );
    const defects = [];
    for (let i = 0; i < 4; i++) {
      const failId = await execute(`detection-${i}`, i + 2, -9 + i, 'FAIL');
      const detected = await prisma.testExecutionStep.findFirst({
        where: { executionId: failId },
        orderBy: { position: 'asc' }
      });
      const id = await step(
        `defect-${i}`,
        -8.9 + i,
        async (ctx) =>
          (
            await defectService.create(
              projectId,
              {
                title: `${PREFIX} Defeito ${i + 1} — ciclo de correção e validação`,
                description: 'Defeito artificial de homologação com detecção real no domínio.',
                severity: ['CRITICA', 'ALTA', 'MEDIA', 'BAIXA'][i],
                responsibleUserId: actorId,
                requirementId: req[1],
                originTaskIds: [flow[i]],
                detectedExecutionStepId: detected.id
              },
              ctx
            )
          ).id
      );
      defects.push(id);
      if (i === 0) continue;
      const correction = await createTask(`Correção ${i}`, -7 + i, req[1]);
      await step(
        `correction-${i}`,
        -6.9 + i,
        async (ctx) => {
          const d = await prisma.defect.findUnique({ where: { id } });
          await defectService.correction(
            id,
            {
              expectedRevision: d.revision,
              correctionCycle: d.currentCorrectionCycle,
              taskId: correction
            },
            ctx
          );
          return id;
        },
        { knownId: id }
      );
      await move(`correction-start-${i}`, correction, -6.8 + i, 'EM_ANDAMENTO');
      await effort(`correction-${i}`, correction, -6.7 + i, 2);
      if (i > 1) {
        await move(`correction-done-${i}`, correction, -6.5 + i, 'CONCLUIDO');
        await evidence(`correction-${i}`, correction, -6.4 + i);
        await execute(`retest-block-${i}`, i + 2, -6.3 + i, 'BLOCKED', id);
      }
      if (i === 3) {
        await execute('retest-fail', 5, -2.8, 'FAIL', id);
        await step(
          'correction-cycle-2',
          -2.7,
          async (ctx) => {
            const d = await prisma.defect.findUnique({ where: { id } });
            await defectService.correction(
              id,
              {
                expectedRevision: d.revision,
                correctionCycle: d.currentCorrectionCycle,
                taskId: correction
              },
              ctx
            );
            return id;
          },
          { knownId: id }
        );
        await execute('retest-pass', 5, -2.5, 'PASS', id);
      }
    }
    // Complete the authorized live Sprint normally, preserving its frozen snapshot.
    await step(
      'close-existing',
      0,
      async (ctx) => {
        await sprintService.updateSprintStatus(completeSprintId, 'CONCLUIDA', ctx);
        return completeSprintId;
      },
      { knownId: completeSprintId }
    );
    // Historical simulations occupy dates before existing planning. They never
    // rewrite legacy movements or the snapshots that existed before this seed.
    let carried;
    for (let s = 0; s < 2; s++) {
      const [start, end] = historicWindows[s],
        tasks = [];
      for (let i = 0; i < 6; i++) {
        const id = await createTask(`Histórico ${s + 1}.${i + 1}`, start - 0.5, req[0]);
        tasks.push(id);
        if (i < 5) await link(`history-${s}-${i}`, id, historic[s], start - 0.4);
      }
      await step(
        `start-history-${s}`,
        start,
        async (ctx) => {
          await sprintService.updateSprintStatus(historic[s], 'EM_ANDAMENTO', ctx);
          return historic[s];
        },
        { knownId: historic[s] }
      );
      await link(`added-${s}`, tasks[5], historic[s], start + 2);
      for (let i = 0; i < 6; i++) {
        await move(
          `history-start-${s}-${i}`,
          tasks[i],
          start + 1 + (i === 5 ? 2 : 0),
          'EM_ANDAMENTO'
        );
        if (s === 0 && i === 4) {
          carried = tasks[i];
          continue;
        }
        const done = Math.min(end - 0.2, start + 2 + i);
        await effort(`history-${s}-${i}`, tasks[i], done - 0.1, [2, 4, 6][i % 3]);
        await move(`history-done-${s}-${i}`, tasks[i], done, 'CONCLUIDO');
        await evidence(`history-${s}-${i}`, tasks[i], done);
      }
      if (s === 1 && carried) {
        await effort('carry', carried, start + 2.5, 4);
        await move('carry', carried, start + 3, 'CONCLUIDO');
        await evidence('carry', carried, start + 3);
      }
      await step(
        `close-history-${s}`,
        end,
        async (ctx) => {
          await sprintService.updateSprintStatus(historic[s], 'CONCLUIDA', ctx);
          return historic[s];
        },
        { knownId: historic[s] }
      );
    }
    await step(
      'start-successor',
      0.01,
      async (ctx) => {
        await sprintService.updateSprintStatus(activateSprintId, 'EM_ANDAMENTO', ctx);
        return activateSprintId;
      },
      { knownId: activateSprintId }
    );
    clock.restore();
    await verifyFrozen();
    journal.complete = true;
    journal.after = await stats();
    journal.generated = {
      requirements: req,
      historicSprints: historic,
      tasks: flow,
      cases,
      defects
    };
    await save();
    log(
      JSON.stringify({ complete: true, after: journal.after, frozenUnchanged: true, journal: file })
    );
    return journal;
  } finally {
    clock?.restore();
    await lock.close();
    await unlink(`${file}.lock`);
  }
}

async function main() {
  dotenv.config({ quiet: true });
  const args = process.argv.slice(2),
    value = (name) => args[args.indexOf(name) + 1];
  const options = {
    apply: args.includes('--apply'),
    projectId: Number(value('--project')),
    actorId: Number(value('--actor')),
    completeSprintId: Number(value('--complete-sprint')),
    activateSprintId: Number(value('--activate-sprint')),
    database: value('--database'),
    projectName: value('--project-name'),
    anchor: value('--anchor')
  };
  validateHomologationEnvironment(process.env, options);
  const { prisma } = await import('../src/database/prismaClient.js');
  try {
    await runHomologationSeed(options, { prisma });
  } finally {
    await prisma.$disconnect();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch((error) => {
    console.error(`Seed interrompido: ${error.code ?? error.message}`);
    process.exitCode = 1;
  });
