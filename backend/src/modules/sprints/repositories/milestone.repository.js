// Repository de marcos. Todo acesso ao banco passa pelo Prisma parametrizado.
import { Prisma } from '@prisma/client';
import { prisma } from '../../../database/prismaClient.js';
import { auditRepository } from '../../audit/audit.repository.js';

export const milestoneSelect = {
  id: true,
  projectId: true,
  sprintId: true,
  title: true,
  description: true,
  dueDate: true,
  status: true,
  createdAt: true,
  updatedAt: true
};

// Locks primeiro, leituras depois, na ordem Project -> Sprint -> Milestone
// (ADR-010 D17). O marco acompanha a imutabilidade da sprint que o ancora
// (D12): validar a sprint fora da transacao deixava a mutacao do marco confirmar
// depois que outra requisicao ja a tinha encerrado, e uma reducao de janela
// simultanea nao enxergava o marco recem-criado.
//
// `run` recebe a transacao e o retrato travado. Ele nao sai do repository: quem
// entra pelo service e `validate`, que so recebe o retrato e lanca erro de
// dominio.
async function withMilestoneLocks(projectId, sprintIds, milestoneId, run) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM Project WHERE id = ${projectId} FOR UPDATE`;
    // Ordem crescente de id: quando a atualizacao move o marco de sprint, as duas
    // sao travadas, e a ordem fixa impede que dois marcos trocando de lugar em
    // sentidos opostos se esperem.
    const ordenados = [...new Set(sprintIds)].sort((a, b) => a - b);
    await tx.$queryRaw`SELECT id FROM Sprint WHERE id IN (${Prisma.join(ordenados)}) FOR UPDATE`;
    if (milestoneId) {
      await tx.$queryRaw`SELECT id FROM Milestone WHERE id = ${milestoneId} FOR UPDATE`;
    }

    const sprints = await tx.sprint.findMany({
      where: { id: { in: ordenados } },
      select: { id: true, projectId: true, status: true, startDate: true, endDate: true }
    });
    const milestone = milestoneId
      ? await tx.milestone.findUnique({ where: { id: milestoneId }, select: milestoneSelect })
      : null;

    return run(tx, { sprints, milestone });
  });
}

const milestoneMutations = {
  async createWithinSprintLock(projectId, data, auditEvent, validate) {
    return withMilestoneLocks(projectId, [data.sprintId], null, async (tx, retrato) => {
      await validate(retrato);
      const milestone = await tx.milestone.create({
        data: { ...data, projectId },
        select: milestoneSelect
      });
      if (auditEvent) {
        await auditRepository.create({ ...auditEvent, resourceId: String(milestone.id) }, tx);
      }
      return milestone;
    });
  },

  // Devolve null quando o marco sumiu entre a checagem e o lock, no mesmo
  // contrato dos metodos de sprint.
  async updateWithinSprintLock(id, projectId, sprintIds, data, auditEvent, validate) {
    return withMilestoneLocks(projectId, sprintIds, id, async (tx, retrato) => {
      if (!retrato.milestone) return null;
      await validate(retrato);
      const milestone = await tx.milestone.update({ where: { id }, data, select: milestoneSelect });
      if (auditEvent) await auditRepository.create(auditEvent, tx);
      return milestone;
    });
  },

  async deleteWithinSprintLock(id, projectId, sprintIds, auditEvent, validate) {
    return withMilestoneLocks(projectId, sprintIds, id, async (tx, retrato) => {
      if (!retrato.milestone) return null;
      await validate(retrato);
      await tx.milestone.delete({ where: { id } });
      if (auditEvent) await auditRepository.create(auditEvent, tx);
      return { id };
    });
  }
};

export const milestoneRepository = {
  findById(id) {
    return prisma.milestone.findUnique({ where: { id }, select: milestoneSelect });
  },

  // Filtro por projeto no where, nao apenas por id: defesa em profundidade contra IDOR.
  findByIdInProject(id, projectId) {
    return prisma.milestone.findFirst({ where: { id, projectId }, select: milestoneSelect });
  },

  findByProject(projectId, filters = {}) {
    return prisma.milestone.findMany({
      where: { projectId, ...(filters.status ? { status: filters.status } : {}) },
      select: milestoneSelect,
      orderBy: [{ dueDate: 'asc' }, { id: 'asc' }]
    });
  },

  ...milestoneMutations
};
