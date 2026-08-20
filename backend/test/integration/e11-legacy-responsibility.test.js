import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import {
  E11ReconciliationBlockedError,
  auditE11LegacyResponsibilities,
  runE11LegacyReconciliation
} from '../../scripts/lib/e11-legacy-responsibility.js';

let prisma;

async function projectWithLegacyIdentity() {
  const user = await prisma.user.create({
    data: {
      name: 'Pessoa canônica',
      username: `canonical-${Date.now()}`,
      email: `canonical-${Date.now()}@example.invalid`
    }
  });
  const project = await prisma.project.create({
    data: { name: 'Projeto E11', responsibleTeam: 'Equipe E11', accessCode: 'TEST-E11-PROJECT' }
  });
  await prisma.projectMembership.create({
    data: { projectId: project.id, userId: user.id, role: 'MEMBER', isActive: true }
  });
  const member = await prisma.projectMember.create({
    data: { projectId: project.id, name: 'Snapshot membro', email: user.email, role: 'MEMBRO' }
  });
  return { user, project, member };
}

beforeAll(async () => {
  const testDatabaseUrl = configureTestDatabaseEnvironment();
  deployTestMigrations(testDatabaseUrl);
  ({ prisma } = await import('../../src/database/prismaClient.js'));
});
beforeEach(async () => {
  await cleanTestDatabase(prisma);
});
afterAll(async () => {
  await prisma.$disconnect();
});

// N/A após LR.2: a reconciliação deve ocorrer antes do guard que remove ProjectMember.
describe.skip('E11 reconciliação legada no MySQL (somente banco pré-LR.2)', () => {
  it('aplica Tasks e movimentos em uma transação e é idempotente', async () => {
    const { user, project, member } = await projectWithLegacyIdentity();
    const task = await prisma.task.create({
      data: { projectId: project.id, title: 'Tarefa', responsible: 'Snapshot responsável' }
    });
    const movement = await prisma.taskMovement.create({
      data: {
        projectId: project.id,
        taskId: task.id,
        fromStatus: 'A_FAZER',
        toStatus: 'EM_ANDAMENTO',
        movedBy: 'Snapshot ator',
        projectMemberId: member.id
      }
    });
    const mappings = [{ taskId: task.id, projectId: project.id, selectedUserId: user.id }];

    const dryRun = await runE11LegacyReconciliation({ client: prisma, mappings });
    expect(dryRun.pending).toEqual({ tasks: 1, movements: 1 });
    expect((await prisma.task.findUnique({ where: { id: task.id } })).responsibleUserId).toBeNull();

    const applied = await runE11LegacyReconciliation({
      client: prisma,
      mappings,
      apply: true,
      auditRetentionDays: 30
    });
    expect(applied.applied).toEqual({ tasks: 1, movements: 1 });
    expect(await prisma.task.findUnique({ where: { id: task.id } })).toMatchObject({
      responsible: 'Snapshot responsável',
      responsibleUserId: user.id
    });
    expect(await prisma.taskMovement.findUnique({ where: { id: movement.id } })).toMatchObject({
      movedBy: 'Snapshot ator',
      projectMemberId: member.id,
      movedByUserId: user.id
    });
    expect(
      await prisma.auditEvent.count({ where: { reasonCode: 'E11_LEGACY_RECONCILIATION' } })
    ).toBe(2);

    const second = await runE11LegacyReconciliation({
      client: prisma,
      mappings,
      apply: true,
      auditRetentionDays: 30
    });
    expect(second.pending).toEqual({ tasks: 0, movements: 0 });
    expect(second.applied).toEqual({ tasks: 0, movements: 0 });
    expect(
      await prisma.auditEvent.count({ where: { reasonCode: 'E11_LEGACY_RECONCILIATION' } })
    ).toBe(2);
  });

  it('bloqueia o lote inteiro quando um mapeamento está ausente', async () => {
    const { user, project } = await projectWithLegacyIdentity();
    const first = await prisma.task.create({
      data: { projectId: project.id, title: 'Primeira', responsible: 'Legado A' }
    });
    const second = await prisma.task.create({
      data: { projectId: project.id, title: 'Segunda', responsible: 'Legado B' }
    });

    await expect(
      runE11LegacyReconciliation({
        client: prisma,
        mappings: [{ taskId: first.id, projectId: project.id, selectedUserId: user.id }],
        apply: true
      })
    ).rejects.toBeInstanceOf(E11ReconciliationBlockedError);
    expect(await prisma.task.count({ where: { responsibleUserId: { not: null } } })).toBe(0);
    expect((await prisma.task.findUnique({ where: { id: second.id } })).responsible).toBe(
      'Legado B'
    );
  });

  it('bloqueia User sem membership ativa e Task de outro projeto', async () => {
    const { user, project } = await projectWithLegacyIdentity();
    const otherProject = await prisma.project.create({
      data: { name: 'Outro', responsibleTeam: 'Outra', accessCode: 'TEST-E11-OTHER' }
    });
    const task = await prisma.task.create({
      data: { projectId: otherProject.id, title: 'Externa', responsible: 'Legado' }
    });
    const report = await runE11LegacyReconciliation({
      client: prisma,
      mappings: [{ taskId: task.id, projectId: project.id, selectedUserId: user.id }]
    });
    expect(report.blockedTaskIds).toEqual([task.id]);
  });

  it('preserva movimento sem evidência e não apaga histórico', async () => {
    const project = await prisma.project.create({
      data: { name: 'Projeto', responsibleTeam: 'Equipe', accessCode: 'TEST-E11-HISTORY' }
    });
    const task = await prisma.task.create({ data: { projectId: project.id, title: 'Tarefa' } });
    const member = await prisma.projectMember.create({
      data: { projectId: project.id, name: 'Legado', email: 'sem-user@example.invalid' }
    });
    const movement = await prisma.taskMovement.create({
      data: {
        projectId: project.id,
        taskId: task.id,
        fromStatus: 'A_FAZER',
        toStatus: 'EM_ANDAMENTO',
        movedBy: 'Legado',
        projectMemberId: member.id
      }
    });

    const result = await runE11LegacyReconciliation({ client: prisma, mappings: [], apply: true });
    expect(result.unresolvedMovementIds).toEqual([movement.id]);
    expect(await prisma.taskMovement.count()).toBe(1);
    expect(
      (await prisma.taskMovement.findUnique({ where: { id: movement.id } })).movedByUserId
    ).toBeNull();
    expect(
      (await auditE11LegacyResponsibilities({ client: prisma })).audit.counts.movementsUnresolved
    ).toBe(1);
  });
});
