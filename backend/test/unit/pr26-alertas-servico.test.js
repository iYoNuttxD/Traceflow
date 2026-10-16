import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/modules/traceability/traceability-alert.repository.js', () => ({
  traceabilityAlertRepository: {}
}));

const { createTraceabilityAlertService } =
  await import('../../src/modules/traceability/traceability-alert.service.js');

const now = new Date('2026-10-15T12:00:00.000Z');
const taskAlertRow = {
  id: 7,
  type: 'TASK_CONCLUDED_WITHOUT_COMMIT',
  status: 'OPEN',
  occurredAt: now,
  detectedAt: now,
  resolvedAt: null,
  resolutionReason: null,
  dismissedAt: null,
  dismissalReason: null,
  dismissedBy: null,
  subjectCode: 'TASK-3',
  subjectTitle: 'Tarefa confidencial',
  task: {
    id: 3,
    title: 'Tarefa confidencial',
    status: 'CONCLUIDO',
    requirementId: null,
    responsibleUser: null,
    pullRequest: null,
    _count: { issueLinks: 0, commitSuggestions: 0 }
  }
};

let repository;

function service() {
  return createTraceabilityAlertService(repository, { info: vi.fn(), warn: vi.fn() }, () => now, {
    recordOperational: vi.fn()
  });
}

const reads = {
  list: (alerts, context) => alerts.list(9, {}, context),
  summary: (alerts, context) => alerts.summary(9, context),
  get: (alerts, context) => alerts.get(9, 7, context),
  listUnlinkedTasks: (alerts, context) => alerts.listUnlinkedTasks(9, {}, context)
};

beforeEach(() => {
  repository = {
    findMembershipRole: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue({ total: 1, alerts: [taskAlertRow] }),
    summary: vi.fn().mockResolvedValue({
      open: [{ type: 'TASK_CONCLUDED_WITHOUT_COMMIT', _count: { _all: 1 } }],
      dismissed: 0,
      integrationExists: true,
      reconciliation: null
    }),
    findDetail: vi.fn().mockResolvedValue(taskAlertRow),
    listUnlinkedTasks: vi.fn().mockResolvedValue({ total: 0, tasks: [] })
  };
});

describe('PR26 TF-REV-001: leituras de alertas conferem a membership no serviço', () => {
  it.each(Object.keys(reads))(
    'S-01 %s sem membership responde o 404 opaco e não lê o repositório',
    async (name) => {
      const result = reads[name](service(), { actorUserId: 5, role: 'OWNER' });

      await expect(result).rejects.toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: 'Recurso não encontrado.'
      });
      expect(repository.findMembershipRole).toHaveBeenCalledWith(9, 5);
      expect(repository.list).not.toHaveBeenCalled();
      expect(repository.summary).not.toHaveBeenCalled();
      expect(repository.findDetail).not.toHaveBeenCalled();
      expect(repository.listUnlinkedTasks).not.toHaveBeenCalled();
    }
  );

  it.each(Object.keys(reads))('S-02 %s sem ator responde 404', async (name) => {
    await expect(reads[name](service(), {})).rejects.toMatchObject({ statusCode: 404 });
    expect(repository.findMembershipRole).not.toHaveBeenCalled();
  });

  it.each([
    ['VIEWER', { canLink: false, canManage: false }],
    ['MEMBER', { canLink: true, canManage: false }],
    ['MANAGER', { canLink: true, canManage: true }]
  ])('S-03 permissions saem do papel lido pelo serviço (%s)', async (role, expected) => {
    repository.findMembershipRole.mockResolvedValue(role);
    const context = { actorUserId: 5, role: 'OWNER' };

    for (const name of ['list', 'summary', 'get']) {
      const result = await reads[name](service(), context);
      expect(result.permissions, name).toEqual(expected);
    }
  });

  it('S-04 membro lê as tarefas sem vínculo técnico', async () => {
    repository.findMembershipRole.mockResolvedValue('VIEWER');

    const result = await reads.listUnlinkedTasks(service(), { actorUserId: 5 });

    expect(result.tasks).toEqual([]);
    expect(repository.listUnlinkedTasks).toHaveBeenCalledWith(9, {
      status: null,
      skip: 0,
      take: 20
    });
  });
});
