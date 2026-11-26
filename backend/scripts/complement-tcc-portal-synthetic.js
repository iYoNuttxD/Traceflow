/** Complemento local e idempotente do Portal do Cliente da banca.
 * Padrão/--dry-run: inspeciona. --apply: cria artefatos sintéticos e vínculos.
 * --verify: exige que os vínculos persistidos já existam.
 * Não chama GitHub, não cria integração e não altera status/esforço da tarefa.
 */
import dotenv from 'dotenv';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
dotenv.config({ quiet: true });
process.env.NODE_ENV ||= 'development';
let target;
try {
  target = new URL(process.env.DATABASE_URL);
} catch {
  throw Error('Configuração local inválida.');
}
if (
  process.env.NODE_ENV !== 'development' ||
  !['localhost', '127.0.0.1'].includes(target.hostname) ||
  target.pathname !== '/traceflow' ||
  (target.port || '3306') !== '3306'
)
  throw Error('Exige MySQL local de desenvolvimento traceflow.');
const { prisma, disconnectDatabase } = await import('../src/database/prismaClient.js');
const { taskService } = await import('../src/modules/tasks/task.service.js');
const { buildAuditEvent } = await import('../src/modules/audit/audit.service.js');
const dataset = 'traceflow:tcc-banca-2026:v2:portal';
const syntheticSha = createHash('sha1').update(`${dataset}:RF02:synthetic-commit:v1`).digest('hex');
const githubId = `demo:${dataset}:RF02:PR42`;
const assert = (value, message) => {
  if (!value) throw Error(message);
};
try {
  const [db] = await prisma.$queryRaw`SELECT DATABASE() AS db, @@read_only AS readOnly`;
  assert(db.db === 'traceflow' && Number(db.readOnly) === 0, 'Alvo local inválido.');
  const owner = await prisma.user.findUnique({
    where: { username: 'daniel.musse' },
    select: { id: true }
  });
  const project = await prisma.project.findUnique({
    where: { id: 219 },
    include: { memberships: true, githubIntegration: true }
  });
  assert(
    project?.name === 'Portal do Cliente' &&
      project.description?.endsWith(`[dataset:${dataset}]`) &&
      !project.deletedAt &&
      !project.githubIntegration,
    'Fixture local do Portal divergente.'
  );
  assert(
    project.memberships.some((m) => m.userId === owner?.id && m.role === 'OWNER' && m.isActive),
    'OWNER divergente.'
  );
  const task = await prisma.task.findUnique({ where: { id: 724 }, include: { requirement: true } });
  assert(
    task?.projectId === 219 &&
      task.requirementId === 232 &&
      task.requirement.title === 'RF02 — Consultar solicitações' &&
      task.title === 'Implementar consulta de solicitações',
    'Tarefa/requisito divergente.'
  );
  const preserved = {
    status: task.status,
    priority: task.priority,
    estimatedEffort: task.estimatedEffort,
    actualEffort: task.actualEffort,
    responsibleUserId: task.responsibleUserId,
    sprintId: task.sprintId
  };
  let commit = await prisma.commit.findUnique({
    where: { projectId_hash: { projectId: 219, hash: syntheticSha } }
  });
  let pr = await prisma.pullRequest.findUnique({
    where: { projectId_githubId: { projectId: 219, githubId } }
  });
  assert(
    !task.pullRequestId || task.pullRequestId === pr?.id,
    'Tarefa já possui outra PR; preservação obrigatória.'
  );
  assert(
    !commit || (commit.message.startsWith('[DEMO]') && !commit.githubUrl),
    'Commit existente divergente.'
  );
  assert(
    !pr || (pr.number === 42 && pr.title.startsWith('[DEMO]') && !pr.githubUrl),
    'PR existente divergente.'
  );
  const apply = process.argv.includes('--apply');
  const plans = {
    dataset,
    synthetic: true,
    projectId: 219,
    requirementId: 232,
    taskId: 724,
    commitSha: syntheticSha,
    pullRequestNumber: 42,
    externalCalls: false,
    integrationCreated: false,
    preserved
  };
  if (!apply && !process.argv.includes('--verify'))
    console.log(
      JSON.stringify({
        mode: 'dry-run',
        ...plans,
        createCommit: !commit,
        createPR: !pr,
        linkCommit:
          !commit ||
          !(await prisma.taskCommit.findUnique({
            where: { taskId_commitId: { taskId: 724, commitId: commit.id } }
          })),
        linkPR: !pr || task.pullRequestId !== pr.id
      })
    );
  else {
    let created = false;
    if (apply && (!commit || !pr)) {
      const data = await prisma.$transaction(async (tx) => {
        const c =
          commit ||
          (await tx.commit.create({
            data: {
              projectId: 219,
              hash: syntheticSha,
              message: '[DEMO] feat: implementar consulta de solicitações — RF02',
              authorName: 'Lucas Andrade (persona fictícia)',
              authorUsername: 'lucas-demo',
              date: new Date('2026-10-24T15:00:00Z'),
              githubUrl: null
            }
          }));
        const p =
          pr ||
          (await tx.pullRequest.create({
            data: {
              projectId: 219,
              githubId,
              number: 42,
              title: '[DEMO] RF02 — Consultar solicitações',
              description:
                'Artefato exclusivamente sintético da demonstração acadêmica. Não existe no GitHub e não foi sincronizado. Dataset: ' +
                dataset,
              state: 'open',
              authorUsername: 'lucas-demo',
              sourceBranch: 'demo/rf02-consulta-sintetica',
              targetBranch: 'demo/main',
              githubUrl: null
            }
          }));
        await tx.auditEvent.create({
          data: buildAuditEvent({
            actorUserId: owner.id,
            projectId: 219,
            action: 'TCC_SYNTHETIC_ARTIFACTS_CREATED',
            resourceType: 'Project',
            resourceId: 219,
            requestId: 'tcc-portal-synthetic-rf02',
            reasonCode: 'ACADEMIC_DEMONSTRATION',
            metadata: { source: 'SYNTHETIC_ACADEMIC_DATASET', version: 1, count: 2 }
          })
        });
        return { c, p };
      });
      commit = data.c;
      pr = data.p;
      created = true;
    }
    assert(commit && pr, 'Artefatos sintéticos ainda ausentes; executar --apply.');
    const context = { actorUserId: owner.id, requestId: 'tcc-portal-synthetic-rf02' };
    if (
      apply &&
      !(await prisma.taskCommit.findUnique({
        where: { taskId_commitId: { taskId: 724, commitId: commit.id } }
      }))
    )
      await taskService.linkCommit(724, { commitId: commit.id }, context);
    if (apply && task.pullRequestId !== pr.id)
      await taskService.linkPullRequest(724, { pullRequestId: pr.id }, context);
    const after = await prisma.task.findUnique({
      where: { id: 724 },
      include: {
        requirement: true,
        pullRequest: true,
        commitLinks: { include: { commit: true } },
        artifactLinkPeriods: true
      }
    });
    assert(
      after.pullRequestId === pr.id && after.commitLinks.some((c) => c.commitId === commit.id),
      'Vínculos persistidos ausentes.'
    );
    assert(
      Object.keys(preserved).every((k) => after[k] === preserved[k]),
      'Status/esforço/responsável foram alterados.'
    );
    assert(
      after.requirement.projectId === 219 &&
        after.pullRequest.projectId === 219 &&
        after.commitLinks.every((c) => c.commit.projectId === 219),
      'Escopo dos vínculos inválido.'
    );
    const manifest = {
      ...plans,
      owner: { username: 'daniel.musse', userId: owner.id, role: 'OWNER' },
      commitId: commit.id,
      pullRequestId: pr.id,
      taskCommitId: after.commitLinks.find((c) => c.commitId === commit.id).id,
      pullRequestLinkPeriodIds: after.artifactLinkPeriods
        .filter((p) => p.pullRequestId === pr.id)
        .map((p) => p.id),
      commit,
      pullRequest: pr,
      lifecycleBasis: after.requirement.lifecycleBasis,
      overviewUrl: 'http://localhost:5173/projects/219',
      requirementUrl: 'http://localhost:5173/projects/219/requirements?requirement=232',
      taskUrl: 'http://localhost:5173/projects/219/kanban?task=724',
      verifiedAt: new Date().toISOString()
    };
    const out = resolve('../build/tcc-banca-2026-corrigido');
    await mkdir(out, { recursive: true });
    await writeFile(
      resolve(out, 'PORTAL-DO-CLIENTE-MANIFESTO.json'),
      JSON.stringify(manifest, null, 2)
    );
    console.log(
      JSON.stringify({
        mode: apply ? 'apply' : 'verify',
        created,
        projectId: 219,
        commitId: commit.id,
        pullRequestId: pr.id,
        taskId: 724,
        synthetic: true,
        linksVerified: true
      })
    );
  }
} finally {
  await disconnectDatabase();
}
