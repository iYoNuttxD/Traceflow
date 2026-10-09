import { spawnSync } from 'node:child_process';
import { startTestServer } from '../helpers/http-server.js';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import {
  createCommit,
  createIssue,
  createProject,
  createPullRequest,
  createRequirement,
  createTask
} from '../fixtures/factories.js';

const injected = vi.hoisted(() => ({ failNextReconciliation: false }));
vi.mock(
  '../../src/modules/traceability/traceability-alert.repository.js',
  async (importOriginal) => {
    const original = await importOriginal();
    return {
      ...original,
      reconcileTraceabilityAlerts: async (...args) => {
        if (injected.failNextReconciliation) {
          injected.failNextReconciliation = false;
          throw new Error('falha injetada na reconciliação');
        }
        return original.reconcileTraceabilityAlerts(...args);
      }
    };
  }
);

let prisma;
let app;
let movements;
let links;
let alerts;
let alertService;
let createTraceabilityAlertService;
let suggestions;
let requirements;
let privacyService;
let createLogger;
let sequence = 0;

const CREATED_AT = new Date('2026-08-01T12:00:00.000Z');
const AFTER = new Date('2026-08-10T09:30:00.000Z');
const ms = (date, delta) => new Date(date.getTime() + delta);
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ taskMovementRepository: movements } =
    await import('../../src/modules/tasks/repositories/task-movement.repository.js'));
  ({ taskLinkRepository: links } =
    await import('../../src/modules/tasks/repositories/task-link.repository.js'));
  ({ traceabilityAlertRepository: alerts } =
    await import('../../src/modules/traceability/traceability-alert.repository.js'));
  ({ traceabilityAlertService: alertService, createTraceabilityAlertService } =
    await import('../../src/modules/traceability/traceability-alert.service.js'));
  ({ commitSuggestionService: suggestions } =
    await import('../../src/modules/traceability/commit-suggestion.service.js'));
  ({ requirementRepository: requirements } =
    await import('../../src/modules/requirements/requirement.repository.js'));
  ({ privacyService } = await import('../../src/modules/privacy/privacy.service.js'));
  ({ createLogger } = await import('../../src/shared/logger/logger.js'));
  ({ default: app } = await import('../../src/app.js'));
  app = await startTestServer(app);
  await cleanTestDatabase(prisma);
}, 60000);

afterEach(async () => {
  injected.failNextReconciliation = false;
  vi.restoreAllMocks();
  await cleanTestDatabase(prisma);
});

afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

async function scenario({ integration = true } = {}) {
  sequence += 1;
  const user = await prisma.user.create({
    data: {
      name: `Gestora da bateria ${sequence}`,
      username: `s201int${sequence}`,
      email: `s201-int-${sequence}@example.invalid`
    }
  });
  const project = await createProject(prisma, {
    createdAt: CREATED_AT,
    ...(integration ? { githubOwner: 'traceflow', githubRepo: `int-${sequence}` } : {})
  });
  await prisma.projectMembership.create({
    data: { projectId: project.id, userId: user.id, role: 'MANAGER' }
  });
  return { user, project, actor: { id: user.id, name: user.name } };
}

async function moveTo(taskId, toStatus, actor) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  const result = await movements.transitionStatus({ task, toStatus, actor });
  expect(result.conflict).toBeUndefined();
  return result;
}

const alertsOf = (projectId, where = {}) =>
  prisma.traceabilityAlert.findMany({ where: { projectId, ...where }, orderBy: { id: 'asc' } });

const merged = (at) => ({ state: 'closed', mergedAtGithub: at, closedAtGithub: at });
const closed = (at) => ({ state: 'closed', closedAtGithub: at });

async function expectFixedPoint(projectId) {
  expect(await alerts.reconcileProject(projectId, { dryRun: true })).toMatchObject({
    created: 0,
    resolved: 0
  });
}

function capturingService() {
  const lines = [];
  const log = createLogger({ environment: 'test', write: (_level, line) => lines.push(line) });
  return { service: createTraceabilityAlertService(alerts, log), lines };
}

describe('Bateria S2-01 integração — gatilhos por escritor (blocos T e G)', () => {
  it('AT-T-04 rejeitar a sugestão do RF41 não mexe no alerta', async () => {
    const { user, project, actor } = await scenario();
    const task = await createTask(prisma, project.id);
    const commit = await createCommit(prisma, project.id, { message: `[TASK-${task.id}] ajuste` });
    await moveTo(task.id, 'CONCLUIDO', actor);
    const [before] = await alertsOf(project.id);
    const suggestion = await prisma.taskCommitSuggestion.create({
      data: { projectId: project.id, taskId: task.id, commitId: commit.id }
    });

    await suggestions.reject(project.id, suggestion.id, {
      actorUserId: user.id,
      requestId: 'req-bateria-reject'
    });

    expect(await alertsOf(project.id)).toEqual([
      expect.objectContaining({ id: before.id, status: 'OPEN', resolutionReason: null })
    ]);
  });

  it('AT-T-07 cada ocorrência guarda o instante da sua conclusão, nunca updatedAt', async () => {
    const { project, actor } = await scenario();
    const task = await createTask(prisma, project.id);

    const first = await moveTo(task.id, 'CONCLUIDO', actor);
    await moveTo(task.id, 'EM_ANDAMENTO', actor);
    await new Promise((resolve) => setTimeout(resolve, 15));
    const second = await moveTo(task.id, 'CONCLUIDO', actor);
    await prisma.task.update({ where: { id: task.id }, data: { title: 'Título editado depois' } });
    await alerts.reconcileProject(project.id, { dryRun: false });

    const rows = await alertsOf(project.id);
    expect(rows.map((row) => row.occurredAt)).toEqual([
      first.movement.movedAt,
      second.movement.movedAt
    ]);
    const current = await prisma.task.findUnique({ where: { id: task.id } });
    expect(rows[1].occurredAt).not.toEqual(current.updatedAt);
  });

  it('AT-T-08 PR e issue vinculadas ou removidas não silenciam o RF13', async () => {
    const { project, actor } = await scenario();
    const task = await createTask(prisma, project.id);
    const pullRequest = await createPullRequest(prisma, project.id, merged(AFTER));
    const issue = await createIssue(prisma, project.id, closed(AFTER));
    await moveTo(task.id, 'CONCLUIDO', actor);
    const [rf13] = await alertsOf(project.id, { type: 'TASK_CONCLUDED_WITHOUT_COMMIT' });

    await links.setPullRequest(task.id, pullRequest.id);
    await links.createIssue(task.id, issue.id);
    await links.deleteIssue(task.id, issue.id);
    await links.setPullRequest(task.id, null);

    expect(await alertsOf(project.id, { type: 'TASK_CONCLUDED_WITHOUT_COMMIT' })).toEqual([
      expect.objectContaining({ id: rf13.id, status: 'OPEN' })
    ]);
  });

  it('AT-T-11 título no limite da coluna, com emoji na borda, vira snapshot intacto', async () => {
    const { project } = await scenario();
    const pullRequestTitle = `${'a'.repeat(190)}\u{1F600}`;
    const issueTitle = `${'c'.repeat(189)}\u{1F680}x`;
    await createPullRequest(prisma, project.id, { ...merged(AFTER), title: pullRequestTitle });
    await createIssue(prisma, project.id, { ...closed(AFTER), title: issueTitle });

    await alertService.reconcileAfterSync(project.id);

    const snapshots = (await alertsOf(project.id)).map((row) => row.subjectTitle).sort();
    expect(snapshots).toEqual([pullRequestTitle, issueTitle].sort());
    for (const snapshot of snapshots) expect(LONE_SURROGATE.test(snapshot)).toBe(false);
  });

  it('AT-T-12 excluir o requisito desvincula a tarefa e não altera o alerta', async () => {
    const { project, actor } = await scenario();
    const requirement = await createRequirement(prisma, project.id);
    const task = await createTask(prisma, project.id, { requirementId: requirement.id });
    await moveTo(task.id, 'CONCLUIDO', actor);
    const [before] = await alertsOf(project.id);

    await requirements.deleteRequirement(requirement.id);

    expect(await alertsOf(project.id)).toEqual([
      expect.objectContaining({ id: before.id, status: 'OPEN' })
    ]);
  });

  it('AT-G-01/02 o corte inclui o instante exato e o milissegundo seguinte, e exclui o anterior', async () => {
    const { project } = await scenario();
    const pullRequests = await Promise.all(
      [-1, 0, 1].map((delta) =>
        createPullRequest(prisma, project.id, merged(ms(CREATED_AT, delta)))
      )
    );
    const issues = await Promise.all(
      [-1, 0, 1].map((delta) => createIssue(prisma, project.id, closed(ms(CREATED_AT, delta))))
    );

    await alertService.reconcileAfterSync(project.id);

    const rows = await alertsOf(project.id);
    expect(
      rows
        .map((row) => row.pullRequestId)
        .filter(Boolean)
        .sort()
    ).toEqual([pullRequests[1].id, pullRequests[2].id].sort());
    expect(
      rows
        .map((row) => row.issueId)
        .filter(Boolean)
        .sort()
    ).toEqual([issues[1].id, issues[2].id].sort());
  });

  it('AT-G-03 issue fechada sem data de fechamento não alerta', async () => {
    const { project } = await scenario();
    await createIssue(prisma, project.id, { state: 'closed', closedAtGithub: null });

    await alertService.reconcileAfterSync(project.id);

    expect(await alertsOf(project.id)).toEqual([]);
  });

  it('AT-G-07 issue fechada, reaberta e fechada de novo gera duas ocorrências', async () => {
    const { project } = await scenario();
    const issue = await createIssue(prisma, project.id, closed(AFTER));
    await alertService.reconcileAfterSync(project.id);

    await prisma.issue.update({
      where: { id: issue.id },
      data: { state: 'open', closedAtGithub: null }
    });
    await alertService.reconcileAfterSync(project.id);
    await prisma.issue.update({ where: { id: issue.id }, data: closed(ms(AFTER, 60000)) });
    await alertService.reconcileAfterSync(project.id);

    expect(
      (await alertsOf(project.id)).map((row) => [row.status, row.resolutionReason, row.occurredAt])
    ).toEqual([
      ['RESOLVED', 'ISSUE_REOPENED', AFTER],
      ['OPEN', null, ms(AFTER, 60000)]
    ]);
  });

  it('AT-G-09 dado do GitHub corrigido para antes do corte resolve como RULE_NO_LONGER_APPLIES', async () => {
    const { project } = await scenario();
    const pullRequest = await createPullRequest(prisma, project.id, merged(AFTER));
    const issue = await createIssue(prisma, project.id, closed(AFTER));
    await alertService.reconcileAfterSync(project.id);

    const earlier = ms(CREATED_AT, -86400000);
    await prisma.pullRequest.update({ where: { id: pullRequest.id }, data: merged(earlier) });
    await prisma.issue.update({ where: { id: issue.id }, data: closed(earlier) });
    await alertService.reconcileAfterSync(project.id);

    expect((await alertsOf(project.id)).map((row) => [row.status, row.resolutionReason])).toEqual([
      ['RESOLVED', 'RULE_NO_LONGER_APPLIES'],
      ['RESOLVED', 'RULE_NO_LONGER_APPLIES']
    ]);
  });
});

describe('Bateria S2-01 integração — precedência por estado real (bloco E)', () => {
  it('AT-E-04 commit vence reabertura; reabertura vence regra inativa; vínculo vence reabertura da issue', async () => {
    const { project, actor } = await scenario();
    const reopenedWithCommit = await createTask(prisma, project.id);
    const reopenedWithoutRule = await createTask(prisma, project.id);
    const commit = await createCommit(prisma, project.id);
    const issue = await createIssue(prisma, project.id, closed(AFTER));
    const holder = await createTask(prisma, project.id);
    await moveTo(reopenedWithCommit.id, 'CONCLUIDO', actor);
    await moveTo(reopenedWithoutRule.id, 'CONCLUIDO', actor);
    await alerts.reconcileProject(project.id, { dryRun: false });

    await prisma.task.update({
      where: { id: reopenedWithCommit.id },
      data: { status: 'EM_ANDAMENTO' }
    });
    await prisma.taskCommit.create({
      data: { taskId: reopenedWithCommit.id, commitId: commit.id }
    });
    await prisma.task.update({
      where: { id: reopenedWithoutRule.id },
      data: { status: 'A_FAZER' }
    });
    await prisma.projectGitHubIntegration.delete({ where: { projectId: project.id } });
    await prisma.issue.update({
      where: { id: issue.id },
      data: { state: 'open', closedAtGithub: null }
    });
    await prisma.taskIssue.create({ data: { taskId: holder.id, issueId: issue.id } });
    await alerts.reconcileProject(project.id, { dryRun: false });

    const rows = await alertsOf(project.id);
    const reasonOf = (predicate) => rows.find(predicate).resolutionReason;
    expect(reasonOf((row) => row.taskId === reopenedWithCommit.id)).toBe('COMMIT_LINKED');
    expect(reasonOf((row) => row.taskId === reopenedWithoutRule.id)).toBe('TASK_REOPENED');
    expect(reasonOf((row) => row.issueId === issue.id)).toBe('ISSUE_LINKED');
  });
});

describe('Bateria S2-01 integração — consultas sob mudança (bloco Q)', () => {
  it('AT-Q-05 uma reconciliação entre duas páginas não faz perder alerta', async () => {
    const { user, project } = await scenario();
    for (let index = 0; index < 25; index += 1)
      await createIssue(prisma, project.id, closed(AFTER));
    await alerts.reconcileProject(project.id, { dryRun: false });
    const original = new Set((await alertsOf(project.id)).map((row) => row.id));
    const context = { actorUserId: user.id, role: 'MANAGER' };
    const read = (page) =>
      alertService.list(project.id, { status: 'OPEN', page, limit: 10 }, context);

    const first = await read(1);
    for (let index = 0; index < 3; index += 1) await createIssue(prisma, project.id, closed(AFTER));
    await alerts.reconcileProject(project.id, { dryRun: false });
    const rest = [await read(2), await read(3), await read(4)];

    const seen = new Set([first, ...rest].flatMap((page) => page.alerts.map((alert) => alert.id)));
    for (const id of original) expect(seen.has(id), `alerta ${id}`).toBe(true);
  });
});

describe('Bateria S2-01 integração — logs e auditoria (ASVS V16 e LGPD)', () => {
  it('AT-S-02/V16.4.1 falha pós-sync só registra código, sem título nem quebra de linha forjada', async () => {
    const { project } = await scenario();
    const marker = 'TITULO-SENSIVEL-BATERIA\r\n{"level":"error","message":"forjado"}';
    await createPullRequest(prisma, project.id, { ...merged(AFTER), title: marker });
    const { service, lines } = capturingService();
    vi.spyOn(alerts, 'reconcileProject').mockRejectedValueOnce(
      Object.assign(new Error(`falhou ao gravar ${marker}`), { code: 'P2034' })
    );

    await expect(service.reconcileAfterSync(project.id)).resolves.toBeNull();
    await expect(service.reconcileAfterSync(project.id)).resolves.toMatchObject({ created: 1 });

    expect(lines.length).toBeGreaterThanOrEqual(2);
    for (const line of lines) {
      expect(line).not.toContain('TITULO-SENSIVEL-BATERIA');
      expect(line.includes('\n') || line.includes('\r')).toBe(false);
      expect(() => JSON.parse(line)).not.toThrow();
    }
    expect(lines.some((line) => JSON.parse(line).level === 'warn')).toBe(true);
  });

  it('AT-D-07 dispensa e reprocessamento não levam justificativa nem título ao log ou à auditoria', async () => {
    const { user, project, actor } = await scenario();
    const task = await createTask(prisma, project.id, { title: 'TITULO-TAREFA-BATERIA' });
    await moveTo(task.id, 'CONCLUIDO', actor);
    const [alert] = await alertsOf(project.id);
    const { service, lines } = capturingService();
    const reason = 'JUSTIFICATIVA-PESSOAL-BATERIA de Fulano';
    const context = { actorUserId: user.id, requestId: 'req-bateria-log', role: 'MANAGER' };

    await service.dismiss(project.id, alert.id, { reason }, context);
    await service.reconcileManually(project.id, context);

    const audits = await prisma.auditEvent.findMany({
      where: { projectId: project.id, action: { startsWith: 'TRACEABILITY_ALERT' } }
    });
    const everything = [...lines, ...audits.map((event) => JSON.stringify(event))].join('\n');
    expect(audits.map((event) => event.action).sort()).toEqual([
      'TRACEABILITY_ALERTS_RECONCILED',
      'TRACEABILITY_ALERT_DISMISSED'
    ]);
    expect(everything).not.toContain('JUSTIFICATIVA-PESSOAL-BATERIA');
    expect(everything).not.toContain('TITULO-TAREFA-BATERIA');
  });
});

describe('Bateria S2-01 integração — concorrência (bloco C)', () => {
  it('AT-C-01 dez reprocessamentos simultâneos com conclusões no meio terminam num ponto fixo', async () => {
    const { project, actor } = await scenario();
    const tasks = await Promise.all(
      Array.from({ length: 4 }, () => createTask(prisma, project.id))
    );
    await createIssue(prisma, project.id, closed(AFTER));
    await createPullRequest(prisma, project.id, merged(AFTER));

    await Promise.all([
      ...Array.from({ length: 10 }, () => alerts.reconcileProject(project.id, { dryRun: false })),
      ...tasks.map((task) => moveTo(task.id, 'CONCLUIDO', actor))
    ]);

    const active = await alertsOf(project.id, { status: { in: ['OPEN', 'DISMISSED'] } });
    expect(active).toHaveLength(6);
    expect(new Set(active.map((row) => row.dedupeKey)).size).toBe(6);
    await expectFixedPoint(project.id);
  });

  it('AT-C-02 conclusão, vínculo de commit, fim de sync e reprocessamento concorrentes equivalem ao serial', async () => {
    const { project, actor } = await scenario();
    const concluded = await createTask(prisma, project.id);
    const linked = await createTask(prisma, project.id);
    const commit = await createCommit(prisma, project.id);
    await moveTo(linked.id, 'CONCLUIDO', actor);
    await createIssue(prisma, project.id, closed(AFTER));

    await Promise.all([
      moveTo(concluded.id, 'CONCLUIDO', actor),
      links.createCommit(linked.id, commit.id),
      alertService.reconcileAfterSync(project.id),
      alerts.reconcileProject(project.id, { dryRun: false })
    ]);

    const keys = (await alertsOf(project.id, { status: 'OPEN' })).map((row) => row.dedupeKey);
    expect(keys).toHaveLength(2);
    expect(keys).toContain(`TASK_CONCLUDED_WITHOUT_COMMIT:${concluded.id}`);
    expect(keys.some((key) => key.startsWith('ISSUE_CLOSED_WITHOUT_TASK:'))).toBe(true);
    await expectFixedPoint(project.id);
  });

  it('AT-C-03 dispensa disputando com a resolução nunca deixa DISMISSED com a condição falsa', async () => {
    const { user, project, actor } = await scenario();
    const context = { actorUserId: user.id, requestId: 'req-bateria-race', role: 'MANAGER' };

    for (let round = 0; round < 8; round += 1) {
      const task = await createTask(prisma, project.id);
      const commit = await createCommit(prisma, project.id);
      await moveTo(task.id, 'CONCLUIDO', actor);
      const [alert] = await alertsOf(project.id, { taskId: task.id });

      const [dismissal] = await Promise.allSettled([
        alertService.dismiss(project.id, alert.id, { reason: `Disputa número ${round}.` }, context),
        links.createCommit(task.id, commit.id)
      ]);

      const row = await prisma.traceabilityAlert.findUnique({ where: { id: alert.id } });
      expect(row.status).toBe('RESOLVED');
      expect(row.resolutionReason).toBe('COMMIT_LINKED');
      if (dismissal.status === 'fulfilled')
        expect(row.dismissalReason).toBe(`Disputa número ${round}.`);
      else {
        expect(dismissal.reason.code).toBe('TRACEABILITY_ALERT_NOT_OPEN');
        expect(row.dismissalReason).toBeNull();
      }
    }
  });

  it('AT-C-04 duas dispensas simultâneas: uma vence, a outra não muda nada', async () => {
    const { user, project, actor } = await scenario();
    const other = await prisma.user.create({
      data: {
        name: 'Outra gestora',
        username: `s201int${(sequence += 1)}`,
        email: `s201-int-${sequence}@example.invalid`
      }
    });
    await prisma.projectMembership.create({
      data: { projectId: project.id, userId: other.id, role: 'OWNER' }
    });
    const task = await createTask(prisma, project.id);
    await moveTo(task.id, 'CONCLUIDO', actor);
    const [alert] = await alertsOf(project.id);

    const results = await Promise.all([
      alertService.dismiss(
        project.id,
        alert.id,
        { reason: 'Primeira justificativa.' },
        {
          actorUserId: user.id,
          requestId: 'req-a',
          role: 'MANAGER'
        }
      ),
      alertService.dismiss(
        project.id,
        alert.id,
        { reason: 'Segunda justificativa.' },
        {
          actorUserId: other.id,
          requestId: 'req-b',
          role: 'OWNER'
        }
      )
    ]);

    expect(results.map((result) => result.changed).sort()).toEqual([false, true]);
    const winner = results.find((result) => result.changed);
    const row = await prisma.traceabilityAlert.findUnique({ where: { id: alert.id } });
    expect(row.dismissalReason).toBe(winner.alert.dismissal.reason);
    expect(
      await prisma.auditEvent.count({
        where: { projectId: project.id, action: 'TRACEABILITY_ALERT_DISMISSED' }
      })
    ).toBe(1);
  });

  it('AT-C-05 falha na reconciliação desfaz a mutação inteira', async () => {
    const { project, actor } = await scenario();
    const task = await createTask(prisma, project.id);
    const commit = await createCommit(prisma, project.id);

    injected.failNextReconciliation = true;
    const current = await prisma.task.findUnique({ where: { id: task.id } });
    await expect(
      movements.transitionStatus({ task: current, toStatus: 'CONCLUIDO', actor })
    ).rejects.toThrow('falha injetada');
    injected.failNextReconciliation = true;
    await expect(links.createCommit(task.id, commit.id)).rejects.toThrow('falha injetada');

    expect((await prisma.task.findUnique({ where: { id: task.id } })).status).toBe('A_FAZER');
    expect(await prisma.taskHistoryEntry.count({ where: { taskId: task.id } })).toBe(0);
    expect(await prisma.taskCommit.count({ where: { taskId: task.id } })).toBe(0);
    expect(await alertsOf(project.id)).toEqual([]);
  });

  it('AT-C-06 uma varredura cria na ordem do fato, nulos primeiro e empate pelo sujeito', async () => {
    const { project } = await scenario();
    const withoutHistory = await createTask(prisma, project.id, { status: 'CONCLUIDO' });
    await createIssue(prisma, project.id, closed(ms(AFTER, 2000)));
    await createPullRequest(prisma, project.id, merged(AFTER));
    await createIssue(prisma, project.id, closed(ms(AFTER, 1000)));
    await createIssue(prisma, project.id, closed(ms(AFTER, 1000)));

    await alerts.reconcileProject(project.id, { dryRun: false });

    const rows = await alertsOf(project.id);
    expect(rows[0].taskId).toBe(withoutHistory.id);
    const instants = rows.slice(1).map((row) => row.occurredAt.getTime());
    expect(instants).toEqual([...instants].sort((a, b) => a - b));
    const tied = rows.filter((row) => row.occurredAt?.getTime() === ms(AFTER, 1000).getTime());
    expect(tied[0].issueId).toBeLessThan(tied[1].issueId);
  });
});

describe('Bateria S2-01 integração — ciclo de vida (bloco V) e script', () => {
  async function owner(projectId) {
    sequence += 1;
    const agent = request.agent(app);
    const response = await agent.post('/api/auth/register').send({
      name: `Dona da bateria ${sequence}`,
      username: `s201dona${sequence}`,
      email: `s201-dona-${sequence}@example.invalid`,
      password: 'SenhaSegura123'
    });
    await request(app)
      .post('/api/auth/email-verification/verify')
      .send({ token: response.body.emailVerification.testToken });
    await prisma.projectMembership.create({
      data: { projectId, userId: response.body.user.id, role: 'OWNER' }
    });
    return {
      agent,
      mutate: (method, path) => agent[method](path).set('X-CSRF-Token', response.body.csrfToken)
    };
  }

  it('AT-V-01 projeto em exclusão esconde os alertas e a restauração os devolve intactos', async () => {
    const { project } = await scenario();
    await createIssue(prisma, project.id, closed(AFTER));
    await alerts.reconcileProject(project.id, { dryRun: false });
    const auth = await owner(project.id);
    const path = `/api/projects/${project.id}/traceability/alerts`;
    const before = (await auth.agent.get(path)).body.alerts.map((alert) => alert.id);

    expect((await auth.mutate('delete', `/api/projects/${project.id}`).send({})).status).toBe(200);
    expect((await auth.agent.get(path)).status).toBe(404);
    expect((await auth.mutate('post', `${path}/reconcile`).send({})).status).toBe(404);
    expect((await auth.mutate('post', `/api/projects/${project.id}/restore`).send({})).status).toBe(
      200
    );

    expect((await auth.agent.get(path)).body.alerts.map((alert) => alert.id)).toEqual(before);
  });

  it('AT-V-03 anonimizar quem dispensou pseudonimiza o autor e mantém a justificativa, como documentado', async () => {
    const { user, project, actor } = await scenario();
    const task = await createTask(prisma, project.id);
    await moveTo(task.id, 'CONCLUIDO', actor);
    const [alert] = await alertsOf(project.id);
    const reason = 'Tarefa de documentação revisada pela gestora.';
    await alertService.dismiss(
      project.id,
      alert.id,
      { reason },
      {
        actorUserId: user.id,
        requestId: 'req-bateria-anon',
        role: 'MANAGER'
      }
    );
    await prisma.privacyRequest.create({
      data: {
        userId: user.id,
        type: 'ACCOUNT_DELETION',
        status: 'PENDING',
        scheduledFor: new Date(Date.now() - 60000)
      }
    });

    await privacyService.processDueDeletions({ dryRun: false });

    const { alert: detail } = await alertService.get(project.id, alert.id, { role: 'VIEWER' });
    expect(detail.dismissal.reason).toBe(reason);
    expect(detail.dismissal.by.id).toBe(user.id);
    expect(detail.dismissal.by.name).not.toBe(user.name);
    expect(JSON.stringify(detail)).not.toContain(user.email);
  });

  it('AT-R-06 a varredura de todos os projetos inclui só os ativos', async () => {
    const { project: active } = await scenario();
    const { project: deleted } = await scenario();
    await createIssue(prisma, active.id, closed(AFTER));
    await createIssue(prisma, deleted.id, closed(AFTER));
    await prisma.project.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } });

    const projects = await alertService.reconcileAllProjects({ dryRun: true });

    expect(projects.map((row) => row.projectId)).toContain(active.id);
    expect(projects.map((row) => row.projectId)).not.toContain(deleted.id);
    expect(projects.find((row) => row.projectId === active.id)).toMatchObject({ created: 1 });
    expect(await alertsOf(active.id)).toEqual([]);
  });

  it('AT-R-06 o script recusa aplicar em banco de produção sem --confirm-production', () => {
    const result = spawnSync(
      process.execPath,
      ['scripts/reconcile-traceability-alerts.js', '--apply'],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          NODE_ENV: 'development',
          DATABASE_URL: 'mysql://bateria:bateria@127.0.0.1:1/traceflow_prod'
        }
      }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--confirm-production');
  });
});
