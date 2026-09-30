import { describe, expect, it, vi } from 'vitest';
import { dashboardRepository } from '../../src/modules/indicators/dashboard.repository.js';

const database = vi.hoisted(() => ({
  project: { findFirst: vi.fn() },
  sprint: { findFirst: vi.fn() },
  projectMembership: { findFirst: vi.fn() }
}));
vi.mock('../../src/database/prismaClient.js', () => ({ prisma: database }));

describe('dashboard context selectors', () => {
  it('retains project/sprint visibility and project-scoped membership with minimal identity', async () => {
    database.project.findFirst.mockResolvedValue({ id: 42 });
    database.sprint.findFirst.mockResolvedValue(null);
    database.projectMembership.findFirst.mockResolvedValue({ user: { id: 9, anonymizedAt: null } });
    expect(await dashboardRepository.project(42)).toEqual({ id: 42 });
    expect(await dashboardRepository.sprint(42, 7)).toBeNull();
    expect(await dashboardRepository.responsible(42, 9)).toMatchObject({ user: { id: 9 } });
    expect(database.project.findFirst).toHaveBeenCalledWith({
      where: { id: 42, deletedAt: null },
      select: { id: true, name: true, githubIntegration: { select: { id: true } } }
    });
    expect(database.sprint.findFirst).toHaveBeenCalledWith({
      where: { id: 7, projectId: 42, deletedAt: null },
      select: { id: true, name: true, status: true }
    });
    expect(database.projectMembership.findFirst).toHaveBeenCalledWith({
      where: { projectId: 42, userId: 9 },
      select: { user: { select: { id: true, name: true, anonymizedAt: true } } }
    });
  });
});
