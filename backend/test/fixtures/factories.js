let sequence = 0;
let authenticatedUserId;
export function setAuthenticatedFixtureUser(userId) {
  authenticatedUserId = userId;
}

function nextId() {
  sequence += 1;
  return `${Date.now()}-${sequence}`;
}

export async function createProject(prisma, overrides = {}) {
  const unique = nextId();
  const {
    githubOwner,
    githubRepo,
    githubUrl,
    githubRepositoryId,
    githubRepositoryName,
    githubRepositoryFullName,
    githubRepositoryUrl,
    githubDefaultBranch,
    githubIsPrivate,
    githubIntegratedAt,
    githubAutoSyncEnabled,
    githubLastSyncAt,
    githubSyncStatus,
    githubLastSyncError,
    githubLastSyncAttemptAt,
    inviteLink: _inviteLink,
    ...projectOverrides
  } = overrides;

  const data = {
    name: `Projeto artificial ${unique}`,
    responsibleTeam: 'Equipe artificial',
    accessCode: `TEST-${unique}`,
    status: 'ATIVO',
    ...projectOverrides
  };
  const create = async (tx) => {
    const project = await tx.project.create({ data });
    if (authenticatedUserId)
      await tx.projectMembership.create({
        data: { projectId: project.id, userId: authenticatedUserId, role: 'OWNER' }
      });
    const repositoryName = githubRepositoryName || githubRepo;
    const repositoryFullName =
      githubRepositoryFullName ||
      (githubOwner && repositoryName ? `${githubOwner}/${repositoryName}` : null);
    const repositoryUrl = githubRepositoryUrl || githubUrl;
    if (repositoryName || repositoryFullName || repositoryUrl || githubRepositoryId) {
      await tx.projectGitHubIntegration.create({
        data: {
          projectId: project.id,
          githubRepositoryId: githubRepositoryId ? String(githubRepositoryId) : null,
          repositoryName,
          repositoryFullName,
          repositoryUrl,
          defaultBranch: githubDefaultBranch || null,
          repositoryPrivate: githubIsPrivate ?? null,
          integratedAt: githubIntegratedAt || null,
          autoSyncEnabled: githubAutoSyncEnabled === true,
          lastSyncAt: githubLastSyncAt || null,
          lastSyncStatus: githubSyncStatus || null,
          lastSyncError: githubLastSyncError || null,
          lastSyncAttemptAt: githubLastSyncAttemptAt || null,
          status: 'RECONNECT_REQUIRED'
        }
      });
    }
    return project;
  };
  return prisma.$transaction(create);
}

export async function createRequirement(prisma, projectId, overrides = {}) {
  return prisma.requirement.create({
    data: {
      projectId,
      title: `Requisito artificial ${nextId()}`,
      type: 'FUNCIONAL',
      status: 'CADASTRADO',
      ...overrides
    }
  });
}

export async function createTask(prisma, projectId, overrides = {}) {
  return prisma.task.create({
    data: {
      projectId,
      title: `Tarefa artificial ${nextId()}`,
      priority: 'MEDIA',
      status: 'A_FAZER',
      ...overrides
    }
  });
}

export async function createSprint(prisma, projectId, overrides = {}) {
  return prisma.sprint.create({
    data: {
      projectId,
      name: `Sprint artificial ${nextId()}`,
      objective: 'Objetivo artificial',
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: new Date('2026-08-14T00:00:00.000Z'),
      status: 'PLANEJADA',
      ...overrides
    }
  });
}

// O marco agrupa sprints e nasce sozinho (ADR-011 D01): quem declara o vinculo
// e a sprint, por `createSprint(..., { milestoneId })`.
export async function createMilestone(prisma, projectId, overrides = {}) {
  return prisma.milestone.create({
    data: {
      projectId,
      title: `Marco artificial ${nextId()}`,
      dueDate: new Date('2026-08-14T00:00:00.000Z'),
      status: 'PENDENTE',
      ...overrides
    }
  });
}
export async function createCommit(prisma, projectId, overrides = {}) {
  const unique = nextId();
  const { branch = 'main', ...commitOverrides } = overrides;
  return prisma.$transaction(async (tx) => {
    const commit = await tx.commit.create({
      data: {
        projectId,
        hash: `fake-hash-${unique}`,
        message: `Commit artificial ${unique}`,
        authorName: 'Autor artificial',
        authorEmail: 'autor@example.invalid',
        date: new Date('2026-01-10T12:00:00.000Z'),
        ...commitOverrides
      }
    });
    if (branch) {
      const gitBranch = await tx.gitBranch.upsert({
        where: { projectId_name: { projectId, name: branch } },
        create: { projectId, name: branch, isDefault: branch === 'main', lastSeenAt: new Date() },
        update: { lastSeenAt: new Date(), isActive: true }
      });
      await tx.commitBranch.create({ data: { commitId: commit.id, branchId: gitBranch.id } });
    }
    return commit;
  });
}

export async function createPullRequest(prisma, projectId, overrides = {}) {
  const unique = nextId();

  return prisma.pullRequest.create({
    data: {
      projectId,
      githubId: `fake-pr-${unique}`,
      number: sequence,
      title: `Pull request artificial ${unique}`,
      state: 'open',
      sourceBranch: 'feature/artificial',
      targetBranch: 'main',
      ...overrides
    }
  });
}

export async function createIssue(prisma, projectId, overrides = {}) {
  const unique = nextId();

  return prisma.issue.create({
    data: {
      projectId,
      githubId: `fake-issue-${unique}`,
      number: sequence,
      title: `Issue artificial ${unique}`,
      state: 'open',
      labels: [],
      ...overrides
    }
  });
}
