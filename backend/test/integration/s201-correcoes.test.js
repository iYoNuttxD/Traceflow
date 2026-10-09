import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { createIssue, createProject, createTask } from '../fixtures/factories.js';

let prisma;
let alerts;
let alertService;
let movements;
let deletions;
let buildAuditEvent;
let sequence = 0;

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ traceabilityAlertRepository: alerts } =
    await import('../../src/modules/traceability/traceability-alert.repository.js'));
  ({ traceabilityAlertService: alertService } =
    await import('../../src/modules/traceability/traceability-alert.service.js'));
  ({ taskMovementRepository: movements } =
    await import('../../src/modules/tasks/repositories/task-movement.repository.js'));
  ({ projectDeletionRepository: deletions } =
    await import('../../src/modules/projects/project-deletion.repository.js'));
  ({ buildAuditEvent } = await import('../../src/modules/audit/audit.service.js'));
  await cleanTestDatabase(prisma);
}, 60000);

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanTestDatabase(prisma);
});

afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

describe('Correções S2-01 integração — branches longas (S201-A03)', () => {
  it('C1-02 branch de 512 caracteres é gravada e o nome continua sensível a caixa', async () => {
    const project = await createProject(prisma);
    const longName = `release/${'v'.repeat(504)}`;
    const branch = (name) => ({ projectId: project.id, name, lastSeenAt: new Date() });

    await prisma.gitBranch.create({ data: branch(longName) });
    await prisma.gitBranch.create({ data: branch('Feature/Login') });
    await prisma.gitBranch.create({ data: branch('feature/login') });

    expect(await prisma.gitBranch.count({ where: { projectId: project.id } })).toBe(3);
    const [column] = await prisma.$queryRawUnsafe(
      "SELECT COLUMN_TYPE AS columnType, COLLATION_NAME AS collation FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'GitBranch' AND COLUMN_NAME = 'name'"
    );
    expect(column).toEqual({ columnType: 'varchar(512)', collation: 'utf8mb4_bin' });
  });
});

async function scenario() {
  sequence += 1;
  const user = await prisma.user.create({
    data: {
      name: `Gestora das correções ${sequence}`,
      username: `s201corint${sequence}`,
      email: `s201-cor-int-${sequence}@example.invalid`
    }
  });
  const project = await createProject(prisma, {
    createdAt: new Date('2026-08-01T12:00:00.000Z'),
    githubOwner: 'traceflow',
    githubRepo: `correcoes-${sequence}`
  });
  await prisma.projectMembership.create({
    data: { projectId: project.id, userId: user.id, role: 'MANAGER' }
  });
  await createIssue(prisma, project.id, {
    state: 'closed',
    closedAtGithub: new Date('2026-08-10T09:30:00.000Z')
  });
  return {
    user,
    project,
    context: { actorUserId: user.id, requestId: 'req-cor', role: 'MANAGER' }
  };
}

const recordOf = (projectId) =>
  prisma.traceabilityAlertReconciliation.findUnique({ where: { projectId } });
const summaryOf = async (projectId) =>
  (await alertService.summary(projectId, { role: 'VIEWER' })).reconciliation;
const injectFailure = () =>
  vi
    .spyOn(alerts, 'reconcileProject')
    .mockRejectedValueOnce(Object.assign(new Error('Título sensível'), { code: 'P2034' }));

describe('Correções S2-01 integração — última reconciliação (S201-A05)', () => {
  it('C3-01 reprocessamento manual registra o sucesso e o resumo não marca desatualização', async () => {
    const { project, context } = await scenario();

    await alertService.reconcileManually(project.id, context);

    expect(await recordOf(project.id)).toMatchObject({
      lastTrigger: 'MANUAL',
      lastSucceededAt: expect.any(Date),
      lastFailedAt: null
    });
    expect(await summaryOf(project.id)).toEqual({
      lastSucceededAt: expect.any(Date),
      lastFailedAt: null,
      lastTrigger: 'MANUAL',
      stale: false
    });
  });

  it('C3-02 falha no fim do sync marca desatualização até o próximo sucesso', async () => {
    const { project, context } = await scenario();
    await alertService.reconcileManually(project.id, context);
    injectFailure();

    await expect(alertService.reconcileAfterSync(project.id)).resolves.toBeNull();

    expect(await recordOf(project.id)).toMatchObject({
      lastTrigger: 'GITHUB_SYNC',
      lastFailedAt: expect.any(Date),
      lastErrorCode: 'P2034'
    });
    const stale = await summaryOf(project.id);
    expect(stale).toMatchObject({ stale: true, lastTrigger: 'GITHUB_SYNC' });
    expect(JSON.stringify(stale)).not.toContain('P2034');
    expect(JSON.stringify(stale)).not.toContain('Título sensível');

    await alertService.reconcileManually(project.id, context);
    expect(await summaryOf(project.id)).toMatchObject({ stale: false, lastTrigger: 'MANUAL' });
  });

  it('C3-03 só há falha registrada: o resumo marca desatualização', async () => {
    const { project } = await scenario();
    injectFailure();

    await alertService.reconcileAfterIntegration(project.id);

    expect(await summaryOf(project.id)).toEqual({
      lastSucceededAt: null,
      lastFailedAt: expect.any(Date),
      lastTrigger: 'GITHUB_INTEGRATION',
      stale: true
    });
  });

  it('C3-04 dry-run e reconciliação de mutação não escrevem o registro', async () => {
    const { user, project } = await scenario();
    const task = await createTask(prisma, project.id);

    await alertService.reconcileProject(project.id, { dryRun: true, trigger: 'SCRIPT' });
    const current = await prisma.task.findUnique({ where: { id: task.id } });
    await movements.transitionStatus({
      task: current,
      toStatus: 'CONCLUIDO',
      actor: { id: user.id, name: user.name }
    });

    expect(await recordOf(project.id)).toBeNull();
    expect(await summaryOf(project.id)).toBeNull();
  });

  it('C3-05 a purga do projeto remove o registro', async () => {
    const { user, project, context } = await scenario();
    await alertService.reconcileManually(project.id, context);
    await prisma.project.update({
      where: { id: project.id },
      data: { deletedAt: new Date(), purgeClaimId: 'claim-cor' }
    });

    await deletions.deleteProjectGraph(
      project.id,
      'claim-cor',
      buildAuditEvent({
        actorUserId: user.id,
        action: 'PROJECT_PURGED',
        resourceType: 'Project',
        resourceId: project.id
      })
    );

    expect(await prisma.traceabilityAlertReconciliation.count()).toBe(0);
  });
});
