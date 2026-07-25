export const sampleService = {};
export const invalidAuditWrite = (prisma) => prisma.auditEvent.create({ data: {} });
