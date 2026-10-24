import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  lockActiveProject: vi.fn(),
  lockProjectMembership: vi.fn(),
  membership: vi.fn(),
  read: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  deleteMany: vi.fn(),
  transaction: vi.fn()
}));
vi.mock('../../src/database/prismaClient.js', () => ({
  prisma: {
    $transaction: mocks.transaction,
    projectDashboardPreference: { findUnique: mocks.read }
  }
}));
vi.mock('../../src/modules/projects/active-project-write.js', () => ({
  lockActiveProject: mocks.lockActiveProject
}));
vi.mock('../../src/modules/projects/project-lifecycle-lock.js', () => ({
  lockProjectMembership: mocks.lockProjectMembership
}));
import { dashboardPreferenceRepository } from '../../src/modules/indicators/dashboard-preference.repository.js';

const tx = {
  projectMembership: { findFirst: mocks.membership },
  projectDashboardPreference: {
    findUnique: mocks.read,
    upsert: mocks.upsert,
    update: mocks.update,
    create: mocks.create,
    deleteMany: mocks.deleteMany
  }
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.transaction.mockImplementation((operation) => operation(tx));
  mocks.membership.mockResolvedValue({ id: 9 });
  mocks.read.mockResolvedValue(null);
});

describe('personal dashboard preference writes', () => {
  it.each([true, false])(
    'atomically saves widgets and explicit pin %s for the authenticated pair',
    async (pinnedToOverview) => {
      await dashboardPreferenceRepository.write(4, 7, {
        configurationVersion: 1,
        widgets: ['I23', 'I01'],
        pinnedToOverview
      });
      expect(mocks.lockActiveProject).toHaveBeenCalledWith(tx, 4);
      expect(mocks.lockProjectMembership).toHaveBeenCalledWith(tx, 4, 7);
      expect(mocks.upsert).toHaveBeenCalledExactlyOnceWith({
        where: { projectId_userId: { projectId: 4, userId: 7 } },
        create: {
          projectId: 4,
          userId: 7,
          configurationVersion: 1,
          configuration: { widgets: ['I23', 'I01'], pinnedToOverview }
        },
        update: {
          configurationVersion: 1,
          configuration: { widgets: ['I23', 'I01'], pinnedToOverview }
        }
      });
      expect(mocks.deleteMany).not.toHaveBeenCalled();
    }
  );

  it('preserves an existing pin for older clients omitting the flag', async () => {
    mocks.read.mockResolvedValue({ configuration: { widgets: ['I01'], pinnedToOverview: true } });
    await dashboardPreferenceRepository.write(4, 7, {
      configurationVersion: 1,
      widgets: ['I23', 'I01']
    });
    expect(mocks.read).toHaveBeenCalledExactlyOnceWith({
      where: { projectId_userId: { projectId: 4, userId: 7 } }
    });
    expect(mocks.upsert.mock.calls[0][0].update.configuration).toEqual({
      widgets: ['I23', 'I01'],
      pinnedToOverview: true
    });
    expect(mocks.lockProjectMembership.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.read.mock.invocationCallOrder[0]
    );
  });

  it('does not pin a newly saved panel from an old client', async () => {
    await dashboardPreferenceRepository.write(4, 7, { configurationVersion: 1, widgets: ['I01'] });
    expect(mocks.upsert.mock.calls[0][0].create.configuration.pinnedToOverview).toBe(false);
  });

  it('does not read or write preferences if membership was deactivated before the locked write', async () => {
    mocks.membership.mockResolvedValue(null);
    await expect(
      dashboardPreferenceRepository.write(4, 7, {
        configurationVersion: 1,
        widgets: ['I01'],
        pinnedToOverview: true
      })
    ).rejects.toThrow();
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it('keeps explicit complete reset scoped to the same user and project', async () => {
    expect(await dashboardPreferenceRepository.write(4, 7, null)).toBeNull();
    expect(mocks.deleteMany).toHaveBeenCalledExactlyOnceWith({
      where: { projectId: 4, userId: 7 }
    });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it('changes only the pin even if stored widgets are legacy or were edited in another tab', async () => {
    const configuration = {
      widgets: ['I99', 'I23', 'I01'],
      pinnedToOverview: true,
      futureField: 3
    };
    mocks.read.mockResolvedValue({ configurationVersion: 7, configuration });
    await dashboardPreferenceRepository.setOverviewPin(4, 7, false);
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith({
      where: { projectId_userId: { projectId: 4, userId: 7 } },
      data: { configuration: { ...configuration, pinnedToOverview: false } }
    });
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.deleteMany).not.toHaveBeenCalled();
    expect(mocks.lockProjectMembership.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.read.mock.invocationCallOrder[0]
    );
  });

  it('does not recreate a deleted panel on flag-only unpin', async () => {
    expect(await dashboardPreferenceRepository.setOverviewPin(4, 7, false)).toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('pins the canonical default if no selection was saved yet', async () => {
    await dashboardPreferenceRepository.setOverviewPin(4, 7, true);
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({
      projectId: 4,
      userId: 7,
      configurationVersion: 1,
      configuration: { pinnedToOverview: true, widgets: expect.any(Array) }
    });
  });

  it('revalidates membership before any flag-only access', async () => {
    mocks.membership.mockResolvedValue(null);
    await expect(dashboardPreferenceRepository.setOverviewPin(4, 7, false)).rejects.toThrow();
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
