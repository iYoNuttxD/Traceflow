const roleMap = Object.freeze({
  DONO: 'OWNER', OWNER: 'OWNER', GERENTE: 'MANAGER', MANAGER: 'MANAGER',
  MEMBRO: 'MEMBER', MEMBER: 'MEMBER', VISUALIZADOR: 'VIEWER', VIEWER: 'VIEWER'
});
const normalizeEmail = (value) => typeof value === 'string' ? value.trim().toLowerCase() : '';
const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export async function runMembershipBackfill({ client, apply = false, projectId } = {}) {
  const legacy = await client.projectMember.findMany({
    where: projectId ? { projectId } : undefined,
    orderBy: { id: 'asc' }
  });
  const namesByEmail = new Map();
  for (const member of legacy) {
    const email = normalizeEmail(member.email);
    if (!validEmail(email)) continue;
    const names = namesByEmail.get(email) || new Set();
    names.add(String(member.name || '').trim().toLowerCase());
    namesByEmail.set(email, names);
  }
  const report = {
    mode: apply ? 'apply' : 'dry-run', projectId: projectId ?? null,
    examined: legacy.length, eligible: 0, migrated: 0, alreadyMigrated: 0,
    skippedMissingOrInvalidEmail: 0, skippedAmbiguousIdentity: 0, skippedUnknownRole: 0,
    projectsWithoutEligibleOwner: []
  };
  const eligibleOwnerProjects = new Set();
  for (const member of legacy) {
    const email = normalizeEmail(member.email);
    const role = roleMap[String(member.role || '').toUpperCase()];
    if (!validEmail(email)) { report.skippedMissingOrInvalidEmail += 1; continue; }
    if (namesByEmail.get(email)?.size !== 1) { report.skippedAmbiguousIdentity += 1; continue; }
    if (!role) { report.skippedUnknownRole += 1; continue; }
    if (role === 'OWNER' && member.isActive) eligibleOwnerProjects.add(member.projectId);
    report.eligible += 1;
    const existingUser = await client.user.findUnique({ where: { email }, select: { id: true } });
    const existingMembership = existingUser
      ? await client.projectMembership.findUnique({ where: { projectId_userId: { projectId: member.projectId, userId: existingUser.id } } })
      : null;
    if (existingMembership) { report.alreadyMigrated += 1; continue; }
    if (!apply) continue;
    await client.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { email },
        create: { name: member.name, email, passwordHash: null, mustSetPassword: true, isActive: member.isActive },
        update: {}
      });
      await tx.projectMembership.upsert({
        where: { projectId_userId: { projectId: member.projectId, userId: user.id } },
        create: { projectId: member.projectId, userId: user.id, role, isActive: member.isActive, joinedAt: member.joinedAt },
        update: {}
      });
    });
    report.migrated += 1;
  }
  const projectIds = [...new Set(legacy.map((member) => member.projectId))];
  for (const id of projectIds) {
    if (eligibleOwnerProjects.has(id)) continue;
    const canonicalOwners = await client.projectMembership.count({ where: { projectId: id, role: 'OWNER', isActive: true } });
    if (canonicalOwners === 0) report.projectsWithoutEligibleOwner.push(id);
  }
  return report;
}
