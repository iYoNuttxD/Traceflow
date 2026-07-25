import { prisma } from '../../database/prismaClient.js';

export const authRepository = {
  findUserByEmail(email) { return prisma.user.findUnique({ where: { email } }); },
  findUserById(id) { return prisma.user.findUnique({ where: { id } }); },
  createUser(data) { return prisma.user.create({ data }); },
  updateUser(id, data) { return prisma.user.update({ where: { id }, data }); },
  createSession(data) { return prisma.session.create({ data }); },
  findSession(tokenHash) {
    return prisma.session.findUnique({ where: { tokenHash }, include: { user: true } });
  },
  touchSession(id, lastSeenAt) { return prisma.session.update({ where: { id }, data: { lastSeenAt } }); },
  updateSessionCsrf(id, csrfTokenHash) { return prisma.session.update({ where: { id }, data: { csrfTokenHash } }); },
  revokeSession(id) { return prisma.session.update({ where: { id }, data: { revokedAt: new Date() } }); },
  revokeUserSessions(userId) {
    return prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  },
  createResetToken(data) { return prisma.passwordResetToken.create({ data }); },
  findResetToken(tokenHash) {
    return prisma.passwordResetToken.findUnique({ where: { tokenHash }, include: { user: true } });
  },
  useResetToken(id) { return prisma.passwordResetToken.update({ where: { id }, data: { usedAt: new Date() } }); },
  expireResetTokens(userId) {
    return prisma.passwordResetToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } });
  }
};
