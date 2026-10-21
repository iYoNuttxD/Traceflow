import { prisma } from '../../database/prismaClient.js';
import { auditRepository } from '../audit/audit.repository.js';
import { isProjectWriteBusy, withActiveProjectWrite } from '../projects/active-project-write.js';

const ACTIVE_STATUSES = ['QUEUED', 'RUNNING'];

const reportSelect = {
  id: true,
  projectId: true,
  requestedByUserId: true,
  activeProjectId: true,
  status: true,
  startDate: true,
  endDate: true,
  timeZone: true,
  sprintId: true,
  snapshotVersion: true,
  startedAt: true,
  heartbeatAt: true,
  finishedAt: true,
  durationMs: true,
  errorCode: true,
  errorMessage: true,
  createdAt: true,
  updatedAt: true
};

const personSelect = { userId: true, displayNameSnapshot: true, usernameSnapshot: true };

// Mesma ordem de locks do restante do domínio: Project (via withActiveProjectWrite) → relatório.
async function lockedReport(tx, id) {
  const rows = await tx.$queryRaw`
    SELECT id, projectId, status, activeProjectId, heartbeatAt, updatedAt
    FROM ProjectReport WHERE id = ${id} FOR UPDATE`;
  return rows[0] || null;
}

const livenessAt = (report) => report.heartbeatAt || report.updatedAt;

function ownsLease(report, projectId, leaseCutoff) {
  return (
    report?.status === 'RUNNING' &&
    report.activeProjectId === projectId &&
    livenessAt(report) >= leaseCutoff
  );
}

async function attachRequesters(reports) {
  const pairs = reports.filter((report) => report.requestedByUserId != null);
  if (!pairs.length) return reports.map((report) => ({ ...report, requester: null }));
  const people = await prisma.projectReportPerson.findMany({
    where: {
      OR: pairs.map((report) => ({ reportId: report.id, userId: report.requestedByUserId }))
    },
    select: { reportId: true, ...personSelect }
  });
  const byReport = new Map(people.map((person) => [person.reportId, person]));
  return reports.map((report) => ({ ...report, requester: byReport.get(report.id) ?? null }));
}

// Datas do recorte são `YYYY-MM-DD` (VarChar), então a comparação textual é cronológica.
function listFilters({ status, sprintId, requestedByUserId, startDate, endDate }) {
  const where = {};
  if (status === 'ACTIVE') where.status = { in: ['QUEUED', 'RUNNING'] };
  else if (status) where.status = status;
  if (sprintId === 'none') where.sprintId = null;
  else if (sprintId) where.sprintId = sprintId;
  if (requestedByUserId) where.requestedByUserId = requestedByUserId;
  if (startDate) where.endDate = { not: null, gte: startDate };
  if (endDate) where.startDate = { not: null, lte: endDate };
  return where;
}

export const reportRepository = {
  findActiveSprint(projectId, sprintId) {
    return prisma.sprint.findFirst({
      where: { id: sprintId, projectId, deletedAt: null },
      select: { id: true, name: true, status: true }
    });
  },

  findUser(id) {
    return prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, username: true }
    });
  },

  findUsers(ids) {
    if (!ids.length) return Promise.resolve([]);
    return prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, username: true }
    });
  },

  // A reserva `activeProjectId` é única: duas solicitações simultâneas não criam duas
  // gerações; a perdedora recebe P2002 e o service devolve a ativa. NOWAIT evita esperar
  // atrás de uma escrita longa do projeto (o service tenta de novo algumas vezes).
  create({ projectId, requestedByUserId, filters, requester, auditEvent }) {
    return withActiveProjectWrite(
      projectId,
      async (tx) => {
        const report = await tx.projectReport.create({
          data: {
            projectId,
            requestedByUserId,
            activeProjectId: projectId,
            startDate: filters.startDate ?? null,
            endDate: filters.endDate ?? null,
            timeZone: filters.timeZone ?? null,
            sprintId: filters.sprintId ?? null,
            people: requester ? { create: [requester] } : undefined
          },
          select: reportSelect
        });
        await auditRepository.create({ ...auditEvent, resourceId: String(report.id) }, tx);
        return report;
      },
      { nowait: true }
    );
  },

  isActiveConflict(error) {
    return error?.code === 'P2002';
  },

  isBusy(error) {
    return isProjectWriteBusy(error);
  },

  async findActive(projectId) {
    const report = await prisma.projectReport.findFirst({
      where: { projectId, activeProjectId: projectId, status: { in: ACTIVE_STATUSES } },
      orderBy: { createdAt: 'desc' },
      select: reportSelect
    });
    return report ? (await attachRequesters([report]))[0] : null;
  },

  findForExecution(id) {
    return prisma.projectReport.findUnique({ where: { id }, select: reportSelect });
  },

  async claim(id, projectId, now) {
    try {
      return await withActiveProjectWrite(
        projectId,
        async (tx) => {
          const report = await lockedReport(tx, id);
          if (report?.status !== 'QUEUED' || report.activeProjectId !== projectId) return false;
          await tx.projectReport.update({
            where: { id },
            data: { status: 'RUNNING', startedAt: now, heartbeatAt: now }
          });
          return true;
        },
        { inactiveResult: false, nowait: true }
      );
    } catch (error) {
      if (isProjectWriteBusy(error)) return null;
      throw error;
    }
  },

  async heartbeat(id, projectId, now) {
    const result = await prisma.projectReport.updateMany({
      where: { id, projectId, activeProjectId: projectId, status: 'RUNNING' },
      data: { heartbeatAt: now }
    });
    return result.count === 1;
  },

  // Snapshot, pessoas congeladas e a liberação da reserva entram no mesmo commit:
  // não existe relatório SUCCEEDED sem snapshot nem pessoas pela metade.
  succeed(
    id,
    projectId,
    { snapshot, snapshotVersion, people, finishedAt, durationMs, leaseCutoff }
  ) {
    return withActiveProjectWrite(
      projectId,
      async (tx) => {
        const report = await lockedReport(tx, id);
        if (!ownsLease(report, projectId, leaseCutoff)) return null;
        await tx.projectReport.update({
          where: { id },
          data: {
            status: 'SUCCEEDED',
            activeProjectId: null,
            snapshot,
            snapshotVersion,
            heartbeatAt: finishedAt,
            finishedAt,
            durationMs,
            errorCode: null,
            errorMessage: null
          }
        });
        if (people.length)
          await tx.projectReportPerson.createMany({
            data: people.map((person) => ({ ...person, reportId: id })),
            skipDuplicates: true
          });
        return tx.projectReport.findUnique({ where: { id }, select: reportSelect });
      },
      { inactiveResult: null, timeout: 15000 }
    );
  },

  fail(id, projectId, { errorCode, errorMessage, finishedAt, durationMs }) {
    return withActiveProjectWrite(
      projectId,
      async (tx) => {
        const report = await lockedReport(tx, id);
        if (
          !report ||
          !ACTIVE_STATUSES.includes(report.status) ||
          report.activeProjectId !== projectId
        )
          return null;
        return tx.projectReport.update({
          where: { id },
          data: {
            status: 'FAILED',
            activeProjectId: null,
            snapshot: null,
            heartbeatAt: finishedAt,
            finishedAt,
            durationMs,
            errorCode,
            errorMessage
          },
          select: reportSelect
        });
      },
      { inactiveResult: null, timeout: 15000 }
    );
  },

  // Uma geração sem batimento recente perdeu o processo que a executava (queda ou
  // reinício). Ela é encerrada como FAILED para nunca ficar presa nem virar sucesso.
  async expireIfStillStale(id, projectId, cutoff, now, failure) {
    try {
      return await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM Project WHERE id = ${projectId} FOR UPDATE NOWAIT`;
        const report = await lockedReport(tx, id);
        if (
          !report ||
          report.activeProjectId !== projectId ||
          !ACTIVE_STATUSES.includes(report.status) ||
          livenessAt(report) >= cutoff
        )
          return false;
        await tx.projectReport.update({
          where: { id },
          data: {
            status: 'FAILED',
            activeProjectId: null,
            heartbeatAt: now,
            finishedAt: now,
            errorCode: failure.code,
            errorMessage: failure.message
          }
        });
        return true;
      });
    } catch (error) {
      if (isProjectWriteBusy(error)) return false;
      throw error;
    }
  },

  async list(projectId, { page, limit, filters = {} }) {
    const where = { projectId, ...listFilters(filters) };
    const [total, reports] = await prisma.$transaction([
      prisma.projectReport.count({ where }),
      prisma.projectReport.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: reportSelect
      })
    ]);
    return { total, reports: await attachRequesters(reports) };
  },

  // Resumo do projeto inteiro (sem os filtros da lista): contagem por status e o último
  // relatório pronto.
  async summary(projectId) {
    const [groups, latest] = await prisma.$transaction([
      prisma.projectReport.groupBy({
        by: ['status'],
        where: { projectId },
        _count: { _all: true },
        orderBy: { status: 'asc' }
      }),
      prisma.projectReport.findFirst({
        where: { projectId, status: 'SUCCEEDED' },
        orderBy: [{ finishedAt: 'desc' }, { id: 'desc' }],
        select: { id: true, finishedAt: true }
      })
    ]);
    return {
      counts: Object.fromEntries(groups.map((group) => [group.status, group._count._all])),
      latest
    };
  },

  async findById(projectId, id) {
    const report = await prisma.projectReport.findFirst({
      where: { id, projectId },
      select: {
        ...reportSelect,
        snapshot: true,
        people: { select: personSelect, orderBy: { userId: 'asc' } }
      }
    });
    if (!report) return null;
    const requester =
      report.people.find((person) => person.userId === report.requestedByUserId) ?? null;
    return { ...report, requester };
  }
};
