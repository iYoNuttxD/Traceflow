// Repository de marcos. Todo acesso ao banco passa pelo Prisma parametrizado.
import { prisma } from '../../../database/prismaClient.js';
import { auditRepository } from '../../audit/audit.repository.js';

export const milestoneSelect = {
  id: true,
  projectId: true,
  title: true,
  description: true,
  dueDate: true,
  status: true,
  createdAt: true,
  updatedAt: true
};

// Locks primeiro, leituras depois, na ordem Project -> Milestone (ADR-010 D17).
//
// A sprint saiu daqui com a inversao (ADR-011 D04): o marco nao congela mais
// junto com ela, entao nao ha estado de sprint a validar na escrita do marco. O
// que continua necessario e a linha do projeto — e ela que serializa TODO caminho
// de escrita do cronograma, inclusive a sprint que aponta para este marco. Por
// isso contar sprints depois deste lock e confiavel sem travar cada uma.
//
// `run` recebe a transacao e o retrato travado. Ele nao sai do repository: quem
// entra pelo service e `validate`, que so recebe o retrato e lanca erro de
// dominio.
async function withMilestoneLocks(projectId, milestoneId, run) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM Project WHERE id = ${projectId} FOR UPDATE`;
    if (milestoneId) {
      await tx.$queryRaw`SELECT id FROM Milestone WHERE id = ${milestoneId} FOR UPDATE`;
    }

    const milestone = milestoneId
      ? await tx.milestone.findUnique({ where: { id: milestoneId }, select: milestoneSelect })
      : null;
    const sprintCount = milestoneId ? await tx.sprint.count({ where: { milestoneId } }) : 0;

    return run(tx, { milestone, sprintCount });
  });
}

const milestoneMutations = {
  async createWithinProjectLock(projectId, data, auditEvent, validate) {
    return withMilestoneLocks(projectId, null, async (tx, retrato) => {
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
  async updateWithinProjectLock(id, projectId, data, auditEvent, validate) {
    return withMilestoneLocks(projectId, id, async (tx, retrato) => {
      if (!retrato.milestone) return null;
      await validate(retrato);
      const milestone = await tx.milestone.update({ where: { id }, data, select: milestoneSelect });
      if (auditEvent) await auditRepository.create(auditEvent, tx);
      return milestone;
    });
  },

  async deleteWithinProjectLock(id, projectId, auditEvent, validate) {
    return withMilestoneLocks(projectId, id, async (tx, retrato) => {
      if (!retrato.milestone) return null;
      // `validate` recusa quando ainda ha sprint apontando para o marco. E a
      // UNICA protecao do agrupamento: a FK e `SetNull` de proposito (ADR-011
      // D01), entao sem esta checagem a exclusao passaria e as sprints
      // perderiam o vinculo em silencio. Ela roda sobre a contagem do retrato
      // travado, na mesma transacao — nao ha janela entre conferir e apagar.
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
