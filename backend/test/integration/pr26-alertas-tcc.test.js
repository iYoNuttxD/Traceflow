import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import {
  createIssue,
  createProject,
  createPullRequest,
  createTask
} from '../fixtures/factories.js';

let prisma;
let movements;
let alertService;
let sequence = 0;

const PROJECT_CREATED_AT = new Date('2026-08-01T12:00:00.000Z');
const LONG_BEFORE = new Date('2024-03-05T10:00:00.000Z');

async function scenario({ integration = true } = {}) {
  sequence += 1;
  const user = await prisma.user.create({
    data: {
      name: `Gestora do PR26 ${sequence}`,
      username: `pr26tcc${sequence}`,
      email: `pr26-tcc-${sequence}@example.invalid`
    }
  });
  const project = await createProject(prisma, {
    createdAt: PROJECT_CREATED_AT,
    ...(integration ? { githubOwner: 'traceflow', githubRepo: `pr26-${sequence}` } : {})
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
}

const alertsOf = (projectId) =>
  prisma.traceabilityAlert.findMany({ where: { projectId }, orderBy: { id: 'asc' } });

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ taskMovementRepository: movements } =
    await import('../../src/modules/tasks/repositories/task-movement.repository.js'));
  ({ traceabilityAlertService: alertService } =
    await import('../../src/modules/traceability/traceability-alert.service.js'));
  await cleanTestDatabase(prisma);
});
afterEach(async () => cleanTestDatabase(prisma));
afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

describe('PR26 TF-REV-002: alertas de rastreabilidade literais (RF13, RF39, RF40)', () => {
  it('T-01 RF13 alerta tarefa concluída sem commit em projeto sem integração', async () => {
    const { project, actor, user } = await scenario({ integration: false });
    const task = await createTask(prisma, project.id, { title: 'Sem repositório' });

    await moveTo(task.id, 'CONCLUIDO', actor);

    const [alert] = await alertsOf(project.id);
    expect(alert).toMatchObject({
      type: 'TASK_CONCLUDED_WITHOUT_COMMIT',
      status: 'OPEN',
      taskId: task.id
    });
    const summary = await alertService.summary(project.id, { actorUserId: user.id });
    expect(summary.rules).toEqual({ taskWithoutCommitActive: true, integrationConnected: false });
    const { alert: detail } = await alertService.get(project.id, alert.id, {
      actorUserId: user.id
    });
    expect(detail.context.integrationConnected).toBe(false);
  });

  it('T-02 RF39 alerta PR mesclada antes da criação do projeto', async () => {
    const { project } = await scenario();
    const pullRequest = await createPullRequest(prisma, project.id, {
      state: 'closed',
      mergedAtGithub: LONG_BEFORE,
      closedAtGithub: LONG_BEFORE
    });

    await alertService.reconcileAfterSync(project.id);

    expect(await alertsOf(project.id)).toEqual([
      expect.objectContaining({
        type: 'PULL_REQUEST_MERGED_WITHOUT_TASK',
        pullRequestId: pullRequest.id,
        status: 'OPEN',
        occurredAt: LONG_BEFORE
      })
    ]);
  });

  it('T-03 RF40 alerta issue fechada antes da criação do projeto', async () => {
    const { project } = await scenario();
    const issue = await createIssue(prisma, project.id, {
      state: 'closed',
      closedAtGithub: LONG_BEFORE
    });

    await alertService.reconcileAfterSync(project.id);

    expect(await alertsOf(project.id)).toEqual([
      expect.objectContaining({
        type: 'ISSUE_CLOSED_WITHOUT_TASK',
        issueId: issue.id,
        status: 'OPEN',
        occurredAt: LONG_BEFORE
      })
    ]);
  });

  it('T-04 desconectar o repositório não resolve o alerta RF13', async () => {
    const { project, actor } = await scenario();
    const task = await createTask(prisma, project.id);
    await moveTo(task.id, 'CONCLUIDO', actor);

    await prisma.projectGitHubIntegration.delete({ where: { projectId: project.id } });
    await alertService.reconcileProject(project.id, { dryRun: false });

    expect(await alertsOf(project.id)).toEqual([
      expect.objectContaining({ taskId: task.id, status: 'OPEN', resolutionReason: null })
    ]);
  });

  it('T-05 issue fechada sem data de fechamento alerta com a limitação declarada', async () => {
    const { project, user } = await scenario();
    await createIssue(prisma, project.id, { state: 'closed', closedAtGithub: null });

    await alertService.reconcileAfterSync(project.id);

    const { alerts } = await alertService.list(project.id, {}, { actorUserId: user.id });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      type: 'ISSUE_CLOSED_WITHOUT_TASK',
      occurredAt: null,
      limitations: ['CLOSE_TIME_UNAVAILABLE']
    });
  });

  it('T-06 a reconciliação completa também cria o alerta RF13 em projeto sem integração', async () => {
    const { project } = await scenario({ integration: false });
    const task = await createTask(prisma, project.id, { status: 'CONCLUIDO' });

    await alertService.reconcileProject(project.id, { dryRun: false });

    expect(await alertsOf(project.id)).toEqual([
      expect.objectContaining({
        type: 'TASK_CONCLUDED_WITHOUT_COMMIT',
        status: 'OPEN',
        taskId: task.id
      })
    ]);
  });
});
