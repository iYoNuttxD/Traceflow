import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prismaClient.js';

const identitySelect = {
  id: true,
  userId: true,
  githubUserId: true,
  githubLogin: true,
  linkedAt: true,
  lastAuthenticatedAt: true
};

export const githubAuthRepository = {
  createOAuthState(data) {
    return prisma.gitHubOAuthState.create({ data });
  },
  findOAuthState(tokenHash) {
    return prisma.gitHubOAuthState.findUnique({
      where: { tokenHash },
      include: { user: true, session: true }
    });
  },
  consumeOAuthState(id, now) {
    return prisma.gitHubOAuthState.updateMany({
      where: { id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now }
    });
  },
  findIdentityByGithubUserId(githubUserId) {
    return prisma.gitHubIdentity.findUnique({
      where: { githubUserId },
      include: { user: true }
    });
  },
  findIdentityByUserId(userId) {
    return prisma.gitHubIdentity.findUnique({ where: { userId }, select: identitySelect });
  },
  findIdentityTombstone(githubUserFingerprint) {
    return prisma.gitHubIdentityTombstone.findUnique({
      where: { githubUserFingerprint },
      select: { id: true }
    });
  },
  findUserByEmail(email) {
    return prisma.user.findUnique({ where: { email } });
  },
  findUserByUsername(username) {
    return prisma.user.findUnique({ where: { username }, select: { id: true } });
  },
  async createGithubAccount({ user, identity }) {
    return prisma.$transaction(
      async (tx) => {
        const createdUser = await tx.user.create({ data: user });
        const createdIdentity = await tx.gitHubIdentity.create({
          data: { ...identity, userId: createdUser.id }
        });
        return { user: createdUser, identity: createdIdentity };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  },
  async refreshIdentity(id, githubLogin, now) {
    const identity = await prisma.gitHubIdentity.update({
      where: { id },
      data: { githubLogin, lastAuthenticatedAt: now },
      include: { user: true }
    });
    await prisma.user.update({ where: { id: identity.userId }, data: { lastLoginAt: now } });
    return { ...identity, user: { ...identity.user, lastLoginAt: now } };
  },
  async linkIdentity({ userId, githubUserId, githubLogin, now }) {
    return prisma.$transaction(
      async (tx) => {
        const current = await tx.gitHubIdentity.findUnique({ where: { userId } });
        if (current)
          return {
            status: current.githubUserId === githubUserId ? 'same' : 'exists',
            identity: current
          };
        const claimed = await tx.gitHubIdentity.findUnique({ where: { githubUserId } });
        if (claimed) return { status: 'linked' };
        const identity = await tx.gitHubIdentity.create({
          data: { userId, githubUserId, githubLogin, linkedAt: now, lastAuthenticatedAt: now }
        });
        return { status: 'created', identity };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  },
  markSensitiveReauthenticated(sessionId, userId, githubUserId, now) {
    return prisma.$transaction(
      async (tx) => {
        const identity = await tx.gitHubIdentity.findFirst({ where: { userId, githubUserId } });
        const session = await tx.session.findFirst({
          where: { id: sessionId, userId, revokedAt: null, expiresAt: { gt: now } }
        });
        if (!identity || !session) return { count: 0 };
        await tx.gitHubIdentity.update({
          where: { id: identity.id },
          data: { lastAuthenticatedAt: now }
        });
        await tx.session.update({
          where: { id: session.id },
          data: { lastReauthenticatedAt: now }
        });
        return { count: 1 };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  },
  isUniqueViolation(error) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
};
