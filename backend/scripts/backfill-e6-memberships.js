import { prisma } from '../src/database/prismaClient.js';

const apply = process.argv.includes('--apply');
const roleMap = { DONO: 'OWNER', OWNER: 'OWNER', GERENTE: 'MANAGER', MANAGER: 'MANAGER', MEMBRO: 'MEMBER', MEMBER: 'MEMBER', VISUALIZADOR: 'VIEWER', VIEWER: 'VIEWER' };
const normalizeEmail = (value) => typeof value === 'string' ? value.trim().toLowerCase() : '';

async function run() {
  const legacy = await prisma.projectMember.findMany({ orderBy: { id: 'asc' } });
  const namesByEmail = new Map();
  for (const member of legacy) {
    const email = normalizeEmail(member.email);
    if (!email) continue;
    const names = namesByEmail.get(email) || new Set();
    names.add(member.name.trim().toLowerCase());
    namesByEmail.set(email, names);
  }
  const report = { examined: legacy.length, eligible: 0, migrated: 0, skippedMissingEmail: 0, skippedAmbiguousIdentity: 0 };
  for (const member of legacy) {
    const email = normalizeEmail(member.email);
    if (!email) { report.skippedMissingEmail += 1; continue; }
    if (namesByEmail.get(email).size !== 1) { report.skippedAmbiguousIdentity += 1; continue; }
    report.eligible += 1;
    if (!apply) continue;
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { email },
        create: { name: member.name, email, passwordHash: null, mustSetPassword: true, isActive: member.isActive },
        update: {}
      });
      await tx.projectMembership.upsert({
        where: { projectId_userId: { projectId: member.projectId, userId: user.id } },
        create: { projectId: member.projectId, userId: user.id, role: roleMap[member.role?.toUpperCase()] || 'MEMBER', isActive: member.isActive, joinedAt: member.joinedAt },
        update: {}
      });
    });
    report.migrated += 1;
  }
  process.stdout.write(`${JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...report })}\n`);
}

run().finally(() => prisma.$disconnect());
