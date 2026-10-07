import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
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
  createTask
} from '../fixtures/factories.js';

let prisma;
let movements;
let links;
let tasks;
let alerts;
let reconcileTraceabilityAlerts;
let alertService;
let suggestions;
let deletions;
let buildAuditEvent;
let sequence = 0;

const PROJECT_CREATED_AT = new Date('2026-08-01T12:00:00.000Z');
const AFTER_CUTOFF = new Date('2026-08-10T09:30:00.000Z');
const BEFORE_CUTOFF = new Date('2026-08-01T11:59:59.999Z');

function deferred() {
  let resolve;
  const promise = new Promise((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

async function scenario({ integration = true } = {}) {
  sequence += 1;
  const user = await prisma.user.create({
    data: {
      name: `Gestora artificial ${sequence}`,
      username: `s201user${sequence}`,
      email: `s201-${sequence}@example.invalid`
    }
  });
  const project = await createProject(prisma, {
    createdAt: PROJECT_CREATED_AT,
    ...(integration ? { githubOwner: 'traceflow', githubRepo: `repo-${sequence}` } : {})
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

function alertsOf(projectId, where = {}) {
  return prisma.traceabilityAlert.findMany({
    where: { projectId, ...where },
    orderBy: { id: 'asc' }
  });
}

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ taskMovementRepository: movements } =
    await import('../../src/modules/tasks/repositories/task-movement.repository.js'));
  ({ taskLinkRepository: links } =
    await import('../../src/modules/tasks/repositories/task-link.repository.js'));
  ({ taskRepository: tasks } = await import('../../src/modules/tasks/task.repository.js'));
  ({ traceabilityAlertRepository: alerts, reconcileTraceabilityAlerts } =
    await import('../../src/modules/traceability/traceability-alert.repository.js'));
  ({ traceabilityAlertService: alertService } =
    await import('../../src/modules/traceability/traceability-alert.service.js'));
  ({ commitSuggestionService: suggestions } =
    await import('../../src/modules/traceability/commit-suggestion.service.js'));
  ({ projectDeletionRepository: deletions } =
    await import('../../src/modules/projects/project-deletion.repository.js'));
  ({ buildAuditEvent } = await import('../../src/modules/audit/audit.service.js'));
  await cleanTestDatabase(prisma);
});

afterEach(async () => {
  await cleanTestDatabase(prisma);
});

afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

describe('S2-01 alertas de tarefa concluída sem commit (RF13)', () => {
  it('I1 conclusão sem commit gera um alerta com tarefa, tipo e data da conclusão', async () => {
    const { project, actor } = await scenario();
    const task = await createTask(prisma, project.id, { title: 'Tela de login' });

    const { movement } = await moveTo(task.id, 'CONCLUIDO', actor);

    const [alert] = await alertsOf(project.id);
    expect(alert).toMatchObject({
      type: 'TASK_CONCLUDED_WITHOUT_COMMIT',
      status: 'OPEN',
      taskId: task.id,
      dedupeKey: `TASK_CONCLUDED_WITHOUT_COMMIT:${task.id}`,
      activeKey: `TASK_CONCLUDED_WITHOUT_COMMIT:${task.id}`,
      subjectCode: `TASK-${task.id}`,
      subjectTitle: 'Tela de login'
    });
    expect(alert.occurredAt).toEqual(movement.movedAt);
    expect(await alertsOf(project.id)).toHaveLength(1);
  });

  it('I2 projeto sem integração GitHub não alerta tarefa concluída', async () => {
    const { project, actor } = await scenario({ integration: false });
    const task = await createTask(prisma, project.id);

    await moveTo(task.id, 'CONCLUIDO', actor);

    expect(await alertsOf(project.id)).toEqual([]);
  });

  it('I3 vincular commit resolve o alerta com COMMIT_LINKED e libera a chave', async () => {
    const { project, actor } = await scenario();
    const task = await createTask(prisma, project.id);
    const commit = await createCommit(prisma, project.id);
    await moveTo(task.id, 'CONCLUIDO', actor);

    await links.createCommit(task.id, commit.id);

    const [alert] = await alertsOf(project.id);
    expect(alert).toMatchObject({
      status: 'RESOLVED',
      resolutionReason: 'COMMIT_LINKED',
      activeKey: null
    });
    expect(alert.resolvedAt).toBeInstanceOf(Date);
  });

  it('I4 confirmar sugestão do RF41 resolve o alerta (G2)', async () => {
    const { user, project, actor } = await scenario();
    const task = await createTask(prisma, project.id);
    const commit = await createCommit(prisma, project.id, { message: `[TASK-${task.id}] login` });
    await moveTo(task.id, 'CONCLUIDO', actor);
    const suggestion = await prisma.taskCommitSuggestion.create({
      data: { projectId: project.id, taskId: task.id, commitId: commit.id }
    });

    await suggestions.confirm(project.id, suggestion.id, {
      actorUserId: user.id,
      requestId: 'req-s201-i4'
    });

    expect(await alertsOf(project.id)).toEqual([
      expect.objectContaining({ status: 'RESOLVED', resolutionReason: 'COMMIT_LINKED' })
    ]);
  });

  it('I5 reabrir resolve com TASK_REOPENED; concluir de novo cria uma ocorrência nova', async () => {
    const { project, actor } = await scenario();
    const task = await createTask(prisma, project.id);
    await moveTo(task.id, 'CONCLUIDO', actor);

    await moveTo(task.id, 'EM_ANDAMENTO', actor);
    await moveTo(task.id, 'CONCLUIDO', actor);

    const rows = await alertsOf(project.id);
    expect(rows.map((row) => [row.status, row.resolutionReason])).toEqual([
      ['RESOLVED', 'TASK_REOPENED'],
      ['OPEN', null]
    ]);
    expect(new Set(rows.map((row) => row.dedupeKey)).size).toBe(1);
  });

  it('I6 excluir a tarefa resolve com TASK_DELETED e preserva o snapshot', async () => {
    const { project, actor } = await scenario();
    const task = await createTask(prisma, project.id, { title: 'Relatório mensal' });
    await moveTo(task.id, 'CONCLUIDO', actor);

    await tasks.deleteTask(task.id);

    expect(await alertsOf(project.id)).toEqual([
      expect.objectContaining({
        status: 'RESOLVED',
        resolutionReason: 'TASK_DELETED',
        taskId: null,
        subjectCode: `TASK-${task.id}`,
        subjectTitle: 'Relatório mensal'
      })
    ]);
  });

  it('tarefa concluída sem histórico de status recebe alerta sem data inventada', async () => {
    const { project } = await scenario();
    await createTask(prisma, project.id, { status: 'CONCLUIDO' });

    await alerts.reconcileProject(project.id, { dryRun: false });

    const [alert] = await alertsOf(project.id);
    expect(alert.status).toBe('OPEN');
    expect(alert.occurredAt).toBeNull();
  });

  it('remover a integração resolve alertas de tarefa com RULE_NO_LONGER_APPLIES', async () => {
    const { project, actor } = await scenario();
    const task = await createTask(prisma, project.id);
    await moveTo(task.id, 'CONCLUIDO', actor);

    await prisma.projectGitHubIntegration.delete({ where: { projectId: project.id } });
    await alerts.reconcileProject(project.id, { dryRun: false });

    expect(await alertsOf(project.id)).toEqual([
      expect.objectContaining({ status: 'RESOLVED', resolutionReason: 'RULE_NO_LONGER_APPLIES' })
    ]);
  });
});

describe('S2-01 alertas de PR mesclada e issue fechada sem tarefa (RF39, RF40)', () => {
  it('I7 excluir a única tarefa de uma PR mesclada cria o alerta da PR', async () => {
    const { project } = await scenario();
    const pullRequest = await createPullRequest(prisma, project.id, {
      state: 'closed',
      mergedAtGithub: AFTER_CUTOFF,
      closedAtGithub: AFTER_CUTOFF
    });
    const task = await createTask(prisma, project.id, { pullRequestId: pullRequest.id });

    await tasks.deleteTask(task.id);

    expect(await alertsOf(project.id)).toEqual([
      expect.objectContaining({
        type: 'PULL_REQUEST_MERGED_WITHOUT_TASK',
        status: 'OPEN',
        pullRequestId: pullRequest.id,
        subjectCode: `PR #${pullRequest.number}`,
        occurredAt: AFTER_CUTOFF
      })
    ]);
  });

  it('I8 trocar a PR da tarefa alerta a PR antiga e resolve a nova', async () => {
    const { project } = await scenario();
    const merged = { state: 'closed', mergedAtGithub: AFTER_CUTOFF, closedAtGithub: AFTER_CUTOFF };
    const oldPullRequest = await createPullRequest(prisma, project.id, merged);
    const newPullRequest = await createPullRequest(prisma, project.id, merged);
    const task = await createTask(prisma, project.id, { pullRequestId: oldPullRequest.id });
    await alerts.reconcileProject(project.id, { dryRun: false });

    await links.setPullRequest(task.id, newPullRequest.id);

    const rows = await alertsOf(project.id);
    expect(rows.find((row) => row.pullRequestId === newPullRequest.id)).toMatchObject({
      status: 'RESOLVED',
      resolutionReason: 'PULL_REQUEST_LINKED'
    });
    expect(rows.find((row) => row.pullRequestId === oldPullRequest.id)).toMatchObject({
      status: 'OPEN'
    });
  });

  it('I9 reconciliação pós-sync alerta PR mesclada e issue fechada e não duplica na repetição', async () => {
    const { project } = await scenario();
    await createPullRequest(prisma, project.id, {
      state: 'closed',
      mergedAtGithub: AFTER_CUTOFF,
      closedAtGithub: AFTER_CUTOFF
    });
    await createIssue(prisma, project.id, { state: 'closed', closedAtGithub: AFTER_CUTOFF });
    await createPullRequest(prisma, project.id, {
      state: 'closed',
      mergedAtGithub: null,
      closedAtGithub: AFTER_CUTOFF
    });
    await createPullRequest(prisma, project.id, { state: 'open' });

    const first = await alertService.reconcileAfterSync(project.id);
    const second = await alertService.reconcileAfterSync(project.id);

    expect(first).toEqual({ created: 2, resolved: 0, kept: 0 });
    expect(second).toEqual({ created: 0, resolved: 0, kept: 2 });
    expect((await alertsOf(project.id)).map((row) => row.type).sort()).toEqual([
      'ISSUE_CLOSED_WITHOUT_TASK',
      'PULL_REQUEST_MERGED_WITHOUT_TASK'
    ]);
  });

  it('I10 o corte inclui o instante de criação do projeto e exclui o anterior', async () => {
    const { project } = await scenario();
    await createPullRequest(prisma, project.id, {
      state: 'closed',
      mergedAtGithub: BEFORE_CUTOFF,
      closedAtGithub: BEFORE_CUTOFF
    });
    const border = await createIssue(prisma, project.id, {
      state: 'closed',
      closedAtGithub: PROJECT_CREATED_AT
    });

    await alertService.reconcileAfterSync(project.id);

    expect(await alertsOf(project.id)).toEqual([
      expect.objectContaining({ type: 'ISSUE_CLOSED_WITHOUT_TASK', issueId: border.id })
    ]);
  });

  it('I11 issue reaberta num sync seguinte resolve com ISSUE_REOPENED', async () => {
    const { project } = await scenario();
    const issue = await createIssue(prisma, project.id, {
      state: 'closed',
      closedAtGithub: AFTER_CUTOFF
    });
    await alertService.reconcileAfterSync(project.id);

    await prisma.issue.update({
      where: { id: issue.id },
      data: { state: 'open', closedAtGithub: null }
    });
    await alertService.reconcileAfterSync(project.id);

    expect(await alertsOf(project.id)).toEqual([
      expect.objectContaining({ status: 'RESOLVED', resolutionReason: 'ISSUE_REOPENED' })
    ]);
  });

  it('I12 lotes gravados por um sync que falhou também são reconciliados', async () => {
    const { project } = await scenario();
    await createPullRequest(prisma, project.id, {
      state: 'closed',
      mergedAtGithub: AFTER_CUTOFF,
      closedAtGithub: AFTER_CUTOFF
    });

    await expect(alertService.reconcileAfterSync(project.id)).resolves.toMatchObject({
      created: 1
    });
  });

  it('vincular e desvincular issue resolve e recria o alerta pela mutação da tarefa', async () => {
    const { project } = await scenario();
    const task = await createTask(prisma, project.id);
    const issue = await createIssue(prisma, project.id, {
      state: 'closed',
      closedAtGithub: AFTER_CUTOFF
    });
    await alerts.reconcileProject(project.id, { dryRun: false });

    await links.createIssue(task.id, issue.id);
    await links.deleteIssue(task.id, issue.id);

    expect((await alertsOf(project.id)).map((row) => [row.status, row.resolutionReason])).toEqual([
      ['RESOLVED', 'ISSUE_LINKED'],
      ['OPEN', null]
    ]);
  });

  it('projeto excluído durante o sync é ignorado sem erro', async () => {
    const { project } = await scenario();
    await prisma.project.update({ where: { id: project.id }, data: { deletedAt: new Date() } });

    await expect(alertService.reconcileAfterSync(project.id)).resolves.toBeNull();
  });
});

describe('S2-01 idempotência, concorrência e persistência', () => {
  it('I14 duas varreduras concorrentes produzem um único ativo por sujeito', async () => {
    const { project } = await scenario();
    await createTask(prisma, project.id, { status: 'CONCLUIDO' });
    await createIssue(prisma, project.id, { state: 'closed', closedAtGithub: AFTER_CUTOFF });
    const locked = deferred();
    const gate = deferred();

    const first = prisma.$transaction(
      async (tx) => {
        const result = await reconcileTraceabilityAlerts(tx, {
          projectId: project.id,
          full: true
        });
        locked.resolve();
        await gate.promise;
        return result;
      },
      { isolationLevel: 'ReadCommitted', timeout: 15000 }
    );
    await locked.promise;
    const second = alerts.reconcileProject(project.id, { dryRun: false });
    gate.resolve();
    const [a, b] = await Promise.all([first, second]);

    expect(a).toEqual({ created: 2, resolved: 0, kept: 0 });
    expect(b).toEqual({ created: 0, resolved: 0, kept: 2 });
    expect(await alertsOf(project.id, { status: 'OPEN' })).toHaveLength(2);
  });

  it('cinco reprocessamentos simultâneos não duplicam alertas ativos', async () => {
    const { project } = await scenario();
    await createTask(prisma, project.id, { status: 'CONCLUIDO' });
    await createPullRequest(prisma, project.id, {
      state: 'closed',
      mergedAtGithub: AFTER_CUTOFF,
      closedAtGithub: AFTER_CUTOFF
    });

    const results = await Promise.all(
      Array.from({ length: 5 }, () => alerts.reconcileProject(project.id, { dryRun: false }))
    );

    expect(results.reduce((sum, result) => sum + result.created, 0)).toBe(2);
    expect(await alertsOf(project.id)).toHaveLength(2);
  });

  it('I15 conclusão concorrente com vínculo de commit termina sem alerta aberto', async () => {
    const { project, actor } = await scenario();
    const task = await createTask(prisma, project.id);
    const commit = await createCommit(prisma, project.id);

    await Promise.all([
      moveTo(task.id, 'CONCLUIDO', actor),
      links.createCommit(task.id, commit.id)
    ]);

    expect(await alertsOf(project.id, { status: 'OPEN' })).toEqual([]);
  });

  it('I16 o banco rejeita segundo ativo e aceita nova ocorrência depois de resolvido', async () => {
    const { project } = await scenario();
    const task = await createTask(prisma, project.id);
    const row = {
      projectId: project.id,
      type: 'TASK_CONCLUDED_WITHOUT_COMMIT',
      dedupeKey: `TASK_CONCLUDED_WITHOUT_COMMIT:${task.id}`,
      taskId: task.id,
      subjectCode: `TASK-${task.id}`,
      subjectTitle: task.title
    };
    const first = await prisma.traceabilityAlert.create({ data: row });

    await expect(prisma.traceabilityAlert.create({ data: row })).rejects.toMatchObject({
      code: 'P2002'
    });
    await expect(
      prisma.traceabilityAlert.createMany({ data: [row], skipDuplicates: true })
    ).resolves.toEqual({ count: 0 });
    await prisma.traceabilityAlert.update({
      where: { id: first.id },
      data: { status: 'DISMISSED' }
    });
    await expect(prisma.traceabilityAlert.create({ data: row })).rejects.toMatchObject({
      code: 'P2002'
    });
    await prisma.traceabilityAlert.update({
      where: { id: first.id },
      data: { status: 'RESOLVED', resolutionReason: 'COMMIT_LINKED' }
    });
    await expect(prisma.traceabilityAlert.create({ data: row })).resolves.toMatchObject({
      status: 'OPEN',
      activeKey: row.dedupeKey
    });
  });

  it('I17 dispensado segura a chave, resolve preservando a dispensa e permite nova ocorrência', async () => {
    const { user, project, actor } = await scenario();
    const task = await createTask(prisma, project.id);
    const commit = await createCommit(prisma, project.id);
    await moveTo(task.id, 'CONCLUIDO', actor);
    const [alert] = await alertsOf(project.id);
    await prisma.traceabilityAlert.update({
      where: { id: alert.id },
      data: {
        status: 'DISMISSED',
        dismissedAt: new Date(),
        dismissedByUserId: user.id,
        dismissalReason: 'Tarefa de documentação sem código.'
      }
    });

    await alerts.reconcileProject(project.id, { dryRun: false });
    expect(await alertsOf(project.id)).toHaveLength(1);

    await links.createCommit(task.id, commit.id);
    expect(await alertsOf(project.id)).toEqual([
      expect.objectContaining({
        status: 'RESOLVED',
        resolutionReason: 'COMMIT_LINKED',
        dismissedByUserId: user.id,
        dismissalReason: 'Tarefa de documentação sem código.'
      })
    ]);

    await moveTo(task.id, 'EM_ANDAMENTO', actor);
    await links.deleteCommit(task.id, commit.id);
    await moveTo(task.id, 'CONCLUIDO', actor);
    expect((await alertsOf(project.id)).map((row) => row.status)).toEqual(['RESOLVED', 'OPEN']);
  });

  it('I18 activeKey é coluna gerada STORED', async () => {
    const [column] = await prisma.$queryRawUnsafe(
      "SELECT EXTRA AS extra FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TraceabilityAlert' AND COLUMN_NAME = 'activeKey'"
    );
    expect(column.extra).toBe('STORED GENERATED');
  });

  it('I19 a purga do projeto remove os alertas', async () => {
    const { user, project, actor } = await scenario();
    const task = await createTask(prisma, project.id);
    await moveTo(task.id, 'CONCLUIDO', actor);
    await createIssue(prisma, project.id, { state: 'closed', closedAtGithub: AFTER_CUTOFF });
    await alerts.reconcileProject(project.id, { dryRun: false });
    expect(await alertsOf(project.id)).toHaveLength(2);
    await prisma.project.update({
      where: { id: project.id },
      data: { deletedAt: new Date(), purgeClaimId: 'claim-s201' }
    });

    const purged = await deletions.deleteProjectGraph(
      project.id,
      'claim-s201',
      buildAuditEvent({
        actorUserId: user.id,
        action: 'PROJECT_PURGED',
        resourceType: 'Project',
        resourceId: project.id
      })
    );

    expect(purged).toBe(true);
    expect(await prisma.traceabilityAlert.count({ where: { projectId: project.id } })).toBe(0);
  });

  it('I20 dry-run calcula sem escrever', async () => {
    const { project } = await scenario();
    await createTask(prisma, project.id, { status: 'CONCLUIDO' });
    await createIssue(prisma, project.id, { state: 'closed', closedAtGithub: AFTER_CUTOFF });

    const result = await alerts.reconcileProject(project.id, { dryRun: true });

    expect(result).toEqual({ created: 2, resolved: 0, kept: 0 });
    expect(await prisma.traceabilityAlert.count()).toBe(0);
  });
});
