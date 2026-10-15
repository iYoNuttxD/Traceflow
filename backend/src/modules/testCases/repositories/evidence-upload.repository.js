import { prisma } from '../../../database/prismaClient.js';
import { lockActiveProject } from '../../projects/active-project-write.js';

// Operational receipts deliberately outlive business resources until safe cleanup.
// No cascading FK may erase ownership metadata before filesystem compensation.
export function createEvidenceUploadRepository(client = prisma) {
  return {
    transaction(work) {
      return client.$transaction((tx) => work(createEvidenceUploadRepository(tx)), {
        isolationLevel: 'ReadCommitted',
        timeout: 15000
      });
    },
    async budget() {
      const rows =
        await client.$queryRaw`SELECT id FROM EvidenceUploadBudget WHERE id = 1 FOR UPDATE`;
      if (rows.length !== 1) throw new Error('UPLOAD_ADMISSION_UNAVAILABLE');
    },
    async now() {
      const [row] = await client.$queryRaw`SELECT UTC_TIMESTAMP(3) AS now`;
      return row.now;
    },
    async lock(id) {
      await client.$queryRaw`SELECT id FROM EvidenceUpload WHERE id = ${id} FOR UPDATE`;
      return this.find(id);
    },
    lockProject(id) {
      return lockActiveProject(client, id);
    },
    async actor(projectId, userId, sessionId) {
      // The project lock serializes membership changes; the user/session locks serialize revocation.
      await client.$queryRaw`SELECT id FROM User WHERE id = ${userId} FOR UPDATE`;
      if (sessionId)
        await client.$queryRaw`SELECT id FROM Session WHERE id = ${sessionId} FOR UPDATE`;
      const user = await client.user.findUnique({
        where: { id: userId },
        select: { id: true, isActive: true, accountStatus: true, sessionVersion: true }
      });
      const member = await client.projectMembership.findFirst({
        where: { projectId, userId, isActive: true }
      });
      const session = sessionId
        ? await client.session.findUnique({ where: { id: sessionId } })
        : null;
      return { user, member, session };
    },
    find(id) {
      return client.evidenceUpload.findUnique({ where: { id } });
    },
    byKey(userId, idempotencyKey) {
      return client.evidenceUpload.findUnique({
        where: { userId_idempotencyKey: { userId, idempotencyKey } }
      });
    },
    create(data) {
      return client.evidenceUpload.create({ data });
    },
    update(id, data) {
      return client.evidenceUpload.update({ where: { id }, data });
    },
    remove(id) {
      return client.evidenceUpload.delete({ where: { id } });
    },
    active() {
      return client.evidenceUpload.findMany({ where: { cleanedAt: null } });
    },
    async list(testCaseId, userId) {
      const pending = await client.evidenceUpload.findMany({
        where: { testCaseId, userId, cleanedAt: null, status: { in: ['OPEN', 'FINALIZING'] } },
        orderBy: { createdAt: 'desc' },
        take: 3
      });
      const recent = await client.evidenceUpload.findMany({
        where: { testCaseId, userId, id: { notIn: pending.map((row) => row.id) } },
        orderBy: { createdAt: 'desc' },
        take: 10 - pending.length
      });
      return [...pending, ...recent];
    },
    candidates(now, take = 50, retentionBefore = new Date(0)) {
      return client.evidenceUpload.findMany({
        where: {
          OR: [
            { expiresAt: { lte: now } },
            { status: { in: ['CANCELLED', 'COMPLETED', 'EXPIRED'] } }
          ],
          AND: [
            { OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] },
            { OR: [{ cleanedAt: null }, { expiresAt: { lt: retentionBefore } }] }
          ]
        },
        orderBy: { updatedAt: 'asc' },
        take
      });
    },
    evidence(keys) {
      return client.testEvidence.findMany({
        where: { storageKey: { in: keys } },
        select: { storageKey: true }
      });
    },
    case(id) {
      return client.testCase.findFirst({
        where: { id, deletedAt: null },
        include: { steps: true }
      });
    }
  };
}
export const evidenceUploadRepository = createEvidenceUploadRepository();
