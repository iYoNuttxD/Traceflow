const LEGACY_ROLE_MAP = new Map([
  ['DONO', 'OWNER'],
  ['OWNER', 'OWNER'],
  ['GERENTE', 'MANAGER'],
  ['MANAGER', 'MANAGER'],
  ['MEMBRO', 'MEMBER'],
  ['MEMBER', 'MEMBER'],
  ['VISUALIZADOR', 'VIEWER'],
  ['VIEWER', 'VIEWER']
]);

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizeBoolean(value) {
  return value === true || value === 1 || value === 1n;
}

function canonicalRole(value) {
  return (
    LEGACY_ROLE_MAP.get(
      String(value || '')
        .trim()
        .toUpperCase()
    ) || null
  );
}

function countByReason(blockers) {
  return blockers.reduce((counts, blocker) => {
    counts[blocker.reason] = (counts[blocker.reason] || 0) + 1;
    return counts;
  }, {});
}

function nonRecoveryGuardBlockerCounts(preflight) {
  return {
    ...(preflight.commitBranchMismatches > 0
      ? { COMMIT_BRANCH_GUARD_BLOCKED: preflight.commitBranchMismatches }
      : {}),
    ...(preflight.githubIntegrationMismatches > 0
      ? { GITHUB_INTEGRATION_GUARD_BLOCKED: preflight.githubIntegrationMismatches }
      : {})
  };
}

export function buildLr2LegacyRecoveryPlan({ members, users, memberships, movements }) {
  const usersByEmail = new Map();
  for (const user of users) {
    const email = normalizeEmail(user.email);
    if (!usersByEmail.has(email)) usersByEmail.set(email, []);
    usersByEmail.get(email).push(user);
  }

  const membershipsByProjectAndUser = new Map(
    memberships.map((membership) => [`${membership.projectId}:${membership.userId}`, membership])
  );
  const memberResolutions = new Map();
  const membershipCreates = [];
  const membershipCreateKeys = new Set();
  const blockers = [];

  for (const member of members) {
    const email = normalizeEmail(member.email);
    const role = canonicalRole(member.role);
    const matchingUsers = email ? usersByEmail.get(email) || [] : [];
    if (!email) {
      blockers.push({ reason: 'MEMBER_EMAIL_MISSING', memberId: member.id });
      continue;
    }
    if (matchingUsers.length !== 1) {
      blockers.push({
        reason:
          matchingUsers.length === 0 ? 'CANONICAL_USER_NOT_FOUND' : 'CANONICAL_USER_AMBIGUOUS',
        memberId: member.id
      });
      continue;
    }
    if (!role) {
      blockers.push({ reason: 'LEGACY_ROLE_UNKNOWN', memberId: member.id });
      continue;
    }

    const user = matchingUsers[0];
    const key = `${member.projectId}:${user.id}`;
    const membership = membershipsByProjectAndUser.get(key);
    const isActive = normalizeBoolean(member.isActive);
    if (
      membership &&
      (membership.role !== role || normalizeBoolean(membership.isActive) !== isActive)
    ) {
      blockers.push({ reason: 'CANONICAL_MEMBERSHIP_CONFLICT', memberId: member.id });
      continue;
    }
    if (!membership && membershipCreateKeys.has(key)) {
      const planned = membershipCreates.find((candidate) => candidate.key === key);
      if (planned.role !== role || planned.isActive !== isActive) {
        blockers.push({ reason: 'LEGACY_MEMBERSHIP_CONFLICT', memberId: member.id });
        continue;
      }
    }
    if (!membership && !membershipCreateKeys.has(key)) {
      membershipCreates.push({
        key,
        projectId: member.projectId,
        userId: user.id,
        role,
        isActive,
        joinedAt: member.joinedAt
      });
      membershipCreateKeys.add(key);
    }
    memberResolutions.set(member.id, {
      memberId: member.id,
      projectId: member.projectId,
      userId: user.id,
      membershipActive: membership ? normalizeBoolean(membership.isActive) : isActive
    });
  }

  const movementUpdates = [];
  for (const movement of movements) {
    const resolution = memberResolutions.get(movement.projectMemberId);
    if (!resolution) {
      blockers.push({ reason: 'MOVEMENT_MEMBER_UNRESOLVED', movementId: movement.id });
      continue;
    }
    if (resolution.projectId !== movement.projectId) {
      blockers.push({ reason: 'MOVEMENT_PROJECT_MISMATCH', movementId: movement.id });
      continue;
    }
    if (
      movement.movedByUserId !== null &&
      movement.movedByUserId !== undefined &&
      movement.movedByUserId !== resolution.userId
    ) {
      blockers.push({ reason: 'MOVEMENT_CANONICAL_ACTOR_CONFLICT', movementId: movement.id });
      continue;
    }
    if (
      (movement.movedByUserId === null || movement.movedByUserId === undefined) &&
      !resolution.membershipActive
    ) {
      blockers.push({ reason: 'MOVEMENT_ACTIVE_MEMBERSHIP_REQUIRED', movementId: movement.id });
      continue;
    }
    movementUpdates.push({
      movementId: movement.id,
      projectMemberId: movement.projectMemberId,
      userId: resolution.userId,
      setCanonicalActor: movement.movedByUserId === null || movement.movedByUserId === undefined
    });
  }

  const unresolvedMemberIds = new Set(
    blockers.filter((blocker) => blocker.memberId !== undefined).map((blocker) => blocker.memberId)
  );
  const deletableMembers = members
    .filter((member) => !unresolvedMemberIds.has(member.id))
    .map((member) => ({ memberId: member.id }));

  return {
    membershipCreates,
    movementUpdates,
    memberDeletes: blockers.length === 0 ? deletableMembers : [],
    blockers,
    counts: {
      projectMembers: members.length,
      movementReferences: movements.length,
      usersMatched: memberResolutions.size,
      membershipsExisting: memberResolutions.size - membershipCreates.length,
      membershipsToCreate: membershipCreates.length,
      movementActorsToSet: movementUpdates.filter((movement) => movement.setCanonicalActor).length,
      movementReferencesToNull: movementUpdates.length,
      projectMembersToDelete: blockers.length === 0 ? deletableMembers.length : 0,
      unresolved: blockers.length
    }
  };
}

async function inspectLegacyShape(client) {
  const rows = await client.$queryRawUnsafe(
    `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND ((TABLE_NAME = 'ProjectMember' AND COLUMN_NAME = 'id')
         OR (TABLE_NAME = 'TaskMovement' AND COLUMN_NAME = 'projectMemberId'))`
  );
  return {
    projectMemberTable: rows.some((row) => row.tableName === 'ProjectMember'),
    projectMemberReference: rows.some(
      (row) => row.tableName === 'TaskMovement' && row.columnName === 'projectMemberId'
    )
  };
}

async function loadLegacyState(client, { lock = false } = {}) {
  const suffix = lock ? ' FOR UPDATE' : '';
  const members = await client.$queryRawUnsafe(
    `SELECT id, projectId, email, role, isActive, joinedAt FROM ProjectMember ORDER BY id${suffix}`
  );
  const movements = await client.$queryRawUnsafe(
    `SELECT id, projectId, projectMemberId, movedByUserId
     FROM TaskMovement WHERE projectMemberId IS NOT NULL ORDER BY id${suffix}`
  );
  const emails = [
    ...new Set(members.map((member) => normalizeEmail(member.email)).filter(Boolean))
  ];
  const projectIds = [...new Set(members.map((member) => member.projectId))];
  const users = emails.length
    ? await client.$queryRawUnsafe(
        `SELECT id, email FROM User
         WHERE LOWER(TRIM(email)) IN (${emails.map(() => '?').join(',')})${suffix}`,
        ...emails
      )
    : [];
  const memberships = projectIds.length
    ? await client.$queryRawUnsafe(
        `SELECT id, projectId, userId, role, isActive FROM ProjectMembership
         WHERE projectId IN (${projectIds.map(() => '?').join(',')})${suffix}`,
        ...projectIds
      )
    : [];
  return { members, movements, users, memberships };
}

async function guardPreflight(client) {
  const [{ projectMembers }] = await client.$queryRawUnsafe(
    'SELECT COUNT(*) AS projectMembers FROM ProjectMember'
  );
  const [{ movementReferences }] = await client.$queryRawUnsafe(
    'SELECT COUNT(*) AS movementReferences FROM TaskMovement WHERE projectMemberId IS NOT NULL'
  );
  const [{ commitBranchMismatches }] = await client.$queryRawUnsafe(
    `SELECT COUNT(*) AS commitBranchMismatches
     FROM Commit AS commitRecord
     WHERE commitRecord.branch IS NOT NULL
       AND TRIM(commitRecord.branch) <> ''
       AND NOT EXISTS (
         SELECT 1
         FROM CommitBranch AS link
         INNER JOIN GitBranch AS branchRecord ON branchRecord.id = link.branchId
         WHERE link.commitId = commitRecord.id AND branchRecord.name = commitRecord.branch
       )`
  );
  const [{ githubIntegrationMismatches }] = await client.$queryRawUnsafe(
    `SELECT COUNT(*) AS githubIntegrationMismatches
     FROM Project AS project
     LEFT JOIN ProjectGitHubIntegration AS integration ON integration.projectId = project.id
     WHERE (
         project.githubRepositoryId IS NOT NULL OR
         project.githubRepositoryFullName IS NOT NULL OR
         project.githubOwner IS NOT NULL OR
         project.githubRepo IS NOT NULL OR
         project.githubUrl IS NOT NULL
       )
       AND (
         (integration.id IS NULL AND NOT (
           project.githubOwner IS NOT NULL AND
           COALESCE(project.githubRepositoryName, project.githubRepo) IS NOT NULL AND
           COALESCE(project.githubRepositoryUrl, project.githubUrl) IS NOT NULL
         )) OR
         COALESCE(
           integration.repositoryName,
           project.githubRepositoryName,
           project.githubRepo
         ) IS NULL OR
         COALESCE(
           integration.repositoryFullName,
           project.githubRepositoryFullName,
           CASE
             WHEN project.githubOwner IS NOT NULL
               AND COALESCE(project.githubRepositoryName, project.githubRepo) IS NOT NULL
             THEN CONCAT(
               project.githubOwner,
               '/',
               COALESCE(project.githubRepositoryName, project.githubRepo)
             )
             ELSE NULL
           END
         ) IS NULL OR
         COALESCE(
           integration.repositoryUrl,
           project.githubRepositoryUrl,
           project.githubUrl
         ) IS NULL
       )`
  );
  const counts = {
    projectMemberRows: Number(projectMembers),
    movementReferences: Number(movementReferences),
    commitBranchMismatches: Number(commitBranchMismatches),
    githubIntegrationMismatches: Number(githubIntegrationMismatches)
  };
  return {
    ...counts,
    verdict: Object.values(counts).every((count) => count === 0) ? 'SAFE_TO_CONTRACT' : 'BLOCKED'
  };
}

function publicReport({ mode, status, plan, preflight, postPreflight }) {
  const guardBlockerCounts = nonRecoveryGuardBlockerCounts(preflight);
  const guardUnresolved = Object.values(guardBlockerCounts).reduce(
    (total, count) => total + count,
    0
  );
  const unresolved = plan.counts.unresolved + guardUnresolved;
  return {
    mode,
    status,
    legacyDataStatus: unresolved > 0 ? 'UNRESOLVED_LEGACY_DATA' : 'RESOLVED',
    counts: { ...plan.counts, unresolved },
    blockerCounts: { ...countByReason(plan.blockers), ...guardBlockerCounts },
    guardPreflight: preflight,
    ...(postPreflight ? { postRecoveryGuardPreflight: postPreflight } : {})
  };
}

async function applyPlan(client, plan) {
  for (const membership of plan.membershipCreates) {
    const changed = await client.$executeRawUnsafe(
      `INSERT INTO ProjectMembership
        (projectId, userId, role, isActive, joinedAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
      membership.projectId,
      membership.userId,
      membership.role,
      membership.isActive,
      membership.joinedAt
    );
    if (changed !== 1) throw new Error('Falha ao criar associação canônica durante o recovery.');
  }
  for (const movement of plan.movementUpdates) {
    const changed = await client.$executeRawUnsafe(
      `UPDATE TaskMovement
       SET movedByUserId = COALESCE(movedByUserId, ?), projectMemberId = NULL
       WHERE id = ? AND projectMemberId = ?
         AND (movedByUserId IS NULL OR movedByUserId = ?)`,
      movement.userId,
      movement.movementId,
      movement.projectMemberId,
      movement.userId
    );
    if (changed !== 1)
      throw new Error('Movimento legado mudou durante o recovery; transação abortada.');
  }
  for (const member of plan.memberDeletes) {
    const changed = await client.$executeRawUnsafe(
      'DELETE FROM ProjectMember WHERE id = ?',
      member.memberId
    );
    if (changed !== 1)
      throw new Error('Membro legado mudou durante o recovery; transação abortada.');
  }
}

export async function runLr2LegacyRecovery({ client, apply = false }) {
  const mode = apply ? 'apply' : 'dry-run';
  const shape = await inspectLegacyShape(client);
  if (!shape.projectMemberTable && !shape.projectMemberReference) {
    return {
      mode,
      status: 'ALREADY_CANONICAL',
      legacyDataStatus: 'RESOLVED',
      counts: {
        projectMembers: 0,
        movementReferences: 0,
        usersMatched: 0,
        membershipsExisting: 0,
        membershipsToCreate: 0,
        movementActorsToSet: 0,
        movementReferencesToNull: 0,
        projectMembersToDelete: 0,
        unresolved: 0
      },
      blockerCounts: {},
      guardPreflight: {
        projectMemberRows: 0,
        movementReferences: 0,
        commitBranchMismatches: 0,
        githubIntegrationMismatches: 0,
        verdict: 'SAFE_TO_CONTRACT'
      }
    };
  }
  if (!shape.projectMemberTable || !shape.projectMemberReference) {
    return {
      mode,
      status: 'BLOCKED',
      legacyDataStatus: 'UNRESOLVED_LEGACY_DATA',
      counts: { unresolved: 1 },
      blockerCounts: { INCONSISTENT_LEGACY_SCHEMA: 1 },
      guardPreflight: { verdict: 'BLOCKED' }
    };
  }

  if (!apply) {
    const state = await loadLegacyState(client);
    const plan = buildLr2LegacyRecoveryPlan(state);
    const preflight = await guardPreflight(client);
    const nonRecoveryBlockers = Object.keys(nonRecoveryGuardBlockerCounts(preflight)).length > 0;
    const status =
      plan.blockers.length || nonRecoveryBlockers
        ? 'BLOCKED'
        : preflight.verdict === 'SAFE_TO_CONTRACT'
          ? 'SAFE_TO_CONTRACT'
          : 'READY_TO_APPLY';
    return publicReport({ mode, status, plan, preflight });
  }

  return client.$transaction(
    async (transaction) => {
      const state = await loadLegacyState(transaction, { lock: true });
      const plan = buildLr2LegacyRecoveryPlan(state);
      const preflight = await guardPreflight(transaction);
      const nonRecoveryBlockers = Object.keys(nonRecoveryGuardBlockerCounts(preflight)).length > 0;
      if (plan.blockers.length || nonRecoveryBlockers) {
        return publicReport({ mode, status: 'BLOCKED', plan, preflight });
      }
      await applyPlan(transaction, plan);
      const postPreflight = await guardPreflight(transaction);
      if (postPreflight.verdict !== 'SAFE_TO_CONTRACT') {
        throw new Error('Preflight pós-recovery recusou o contract; transação abortada.');
      }
      return publicReport({
        mode,
        status: 'SAFE_TO_CONTRACT',
        plan,
        preflight,
        postPreflight
      });
    },
    { maxWait: 10_000, timeout: 60_000 }
  );
}
