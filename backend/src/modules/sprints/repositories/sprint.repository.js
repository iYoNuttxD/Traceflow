// Repository de sprints. Todo acesso ao banco passa pelo Prisma parametrizado.
import { prisma } from '../../../database/prismaClient.js';
import { auditRepository } from '../../audit/audit.repository.js';

export const sprintSelect = {
  id: true,
  projectId: true,
  name: true,
  objective: true,
  startDate: true,
  endDate: true,
  status: true,
  startedAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true
};

// DTO minimizado de tarefa no cronograma: sem e-mail, sem descricao, sem esforco.
const scheduleTaskSelect = {
  id: true,
  title: true,
  status: true,
  priority: true,
  deadline: true,
  responsibleUserId: true,
  sprintId: true
};

export const sprintRepository = {
  findProjectById(projectId) {
    return prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  },

  findById(id) {
    return prisma.sprint.findUnique({ where: { id }, select: sprintSelect });
  },

  // Filtro por projeto no where, nao apenas por id: defesa em profundidade contra IDOR.
  findByIdInProject(id, projectId) {
    return prisma.sprint.findFirst({ where: { id, projectId }, select: sprintSelect });
  },

  findByProject(projectId, filters = {}) {
    return prisma.sprint.findMany({
      where: {
        projectId,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.search ? { name: { contains: filters.search } } : {})
      },
      select: sprintSelect,
      orderBy: [{ startDate: 'asc' }, { id: 'asc' }]
    });
  },

  countTasks(sprintId) {
    return prisma.task.count({ where: { sprintId } });
  },

  async create(projectId, data, auditEvent) {
    return prisma.$transaction(async (tx) => {
      const sprint = await tx.sprint.create({
        data: { ...data, projectId },
        select: sprintSelect
      });
      if (auditEvent) {
        await auditRepository.create({ ...auditEvent, resourceId: String(sprint.id) }, tx);
      }
      return sprint;
    });
  },

  async update(id, data, auditEvent) {
    return prisma.$transaction(async (tx) => {
      const sprint = await tx.sprint.update({ where: { id }, data, select: sprintSelect });
      if (auditEvent) await auditRepository.create(auditEvent, tx);
      return sprint;
    });
  },

  async delete(id, auditEvent) {
    return prisma.$transaction(async (tx) => {
      await tx.sprint.delete({ where: { id } });
      if (auditEvent) await auditRepository.create(auditEvent, tx);
    });
  },

  // Substituicao atomica do conjunto de tarefas da sprint.
  // Falha em qualquer item nao persiste nenhum vinculo.
  async replaceTasks(sprintId, { toAttach, toDetach, historyEntries, auditEvent }) {
    return prisma.$transaction(async (tx) => {
      if (toDetach.length) {
        await tx.task.updateMany({
          where: { id: { in: toDetach } },
          data: { sprintId: null }
        });
      }
      if (toAttach.length) {
        await tx.task.updateMany({
          where: { id: { in: toAttach } },
          data: { sprintId }
        });
      }
      if (historyEntries.length) {
        await tx.taskHistoryEntry.createMany({ data: historyEntries });
      }
      if (auditEvent) await auditRepository.create(auditEvent, tx);
      return tx.task.findMany({
        where: { sprintId },
        select: scheduleTaskSelect,
        orderBy: [{ id: 'asc' }]
      });
    });
  },

  findTasksBySprint(sprintId) {
    return prisma.task.findMany({
      where: { sprintId },
      select: scheduleTaskSelect,
      orderBy: [{ id: 'asc' }]
    });
  },

  // Carrega tarefas do projeto para validacao de pertencimento em lote.
  findTasksByIds(taskIds) {
    return prisma.task.findMany({
      where: { id: { in: taskIds } },
      select: { id: true, projectId: true, sprintId: true }
    });
  },

  // Agregado do cronograma em duas consultas com select explicito, sem N+1.
  scheduleData(projectId) {
    return prisma.$transaction([
      prisma.sprint.findMany({
        where: { projectId },
        select: { ...sprintSelect, tasks: { select: scheduleTaskSelect, orderBy: { id: 'asc' } } },
        orderBy: [{ startDate: 'asc' }, { id: 'asc' }]
      }),
      prisma.task.findMany({
        where: { projectId, sprintId: null },
        select: scheduleTaskSelect,
        orderBy: [{ id: 'asc' }]
      })
    ]);
  }
};
