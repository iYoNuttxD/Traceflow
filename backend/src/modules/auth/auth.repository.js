import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prismaClient.js';

export const authRepository = {
  findUserByEmail(email) {
    return prisma.user.findUnique({ where: { email } });
  },
  findUserByUsername(username) {
    return prisma.user.findUnique({ where: { username } });
  },
  findUserById(id) {
    return prisma.user.findUnique({ where: { id } });
  },
  createUser(data) {
    return prisma.user.create({ data });
  },
  updateUser(id, data) {
    return prisma.user.update({ where: { id }, data });
  },
  changePassword(userId, passwordHash, now = new Date()) {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: { passwordHash, sessionVersion: { increment: 1 } }
      });
      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now }
      });
      await tx.passwordResetToken.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: now }
      });
      return user;
    });
  },
  createSession(data) {
    return prisma.session.create({ data });
  },
  findSession(tokenHash) {
    return prisma.session.findUnique({ where: { tokenHash }, include: { user: true } });
  },
  touchSession(id, lastSeenAt) {
    return prisma.session.update({ where: { id }, data: { lastSeenAt } });
  },
  revokeSession(id) {
    return prisma.session.update({ where: { id }, data: { revokedAt: new Date() } });
  },
  createResetToken(data) {
    return prisma.passwordResetToken.create({ data });
  },
  findResetToken(tokenHash) {
    return prisma.passwordResetToken.findUnique({ where: { tokenHash }, include: { user: true } });
  },
  completePasswordReset(id, userId, passwordHash) {
    return prisma.$transaction(
      async (tx) => {
        // Serialize with password/account mutations before consuming the capability.
        const [user] = await tx.$queryRaw`
          SELECT id, accountStatus FROM User WHERE id = ${userId} FOR UPDATE
        `;
        if (!user || user.accountStatus === 'ANONYMIZED') return false;
        const now = new Date();
        const claimed = await tx.passwordResetToken.updateMany({
          where: { id, userId, usedAt: null, expiresAt: { gt: now } },
          data: { usedAt: now }
        });
        if (claimed.count !== 1) return false;
        await tx.user.update({
          where: { id: userId },
          data: { passwordHash, mustSetPassword: false, sessionVersion: { increment: 1 } }
        });
        await tx.passwordResetToken.updateMany({
          where: { userId, usedAt: null },
          data: { usedAt: now }
        });
        await tx.session.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: now }
        });
        return true;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
    );
  },
  expireResetTokens(userId) {
    return prisma.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() }
    });
  },
  createEmailVerificationToken(data) {
    return prisma.emailVerificationToken.create({ data });
  },
  findEmailVerificationToken(tokenHash) {
    return prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
      include: { user: true }
    });
  },
  expireEmailVerificationTokens(userId) {
    return prisma.emailVerificationToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() }
    });
  },
  completeEmailVerification(id, userId) {
    return prisma.$transaction(
      async (tx) => {
        const [user] = await tx.$queryRaw`
          SELECT id, accountStatus FROM User WHERE id = ${userId} FOR UPDATE
        `;
        if (!user || user.accountStatus === 'ANONYMIZED') return null;
        const now = new Date();
        const claimed = await tx.emailVerificationToken.updateMany({
          where: { id, userId, usedAt: null, expiresAt: { gt: now } },
          data: { usedAt: now }
        });
        if (claimed.count !== 1) return null;
        const verified = await tx.user.update({
          where: { id: userId },
          data: { emailVerifiedAt: now }
        });
        await tx.emailVerificationToken.updateMany({
          where: { userId, usedAt: null },
          data: { usedAt: now }
        });
        return verified;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
    );
  },
  isUniqueViolation(error) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
};
