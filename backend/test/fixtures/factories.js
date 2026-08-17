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

  const data = {
    name: `Projeto artificial ${unique}`,
    responsibleTeam: 'Equipe artificial',
    accessCode: `TEST-${unique}`,
    status: 'ATIVO',
    ...overrides
  };
  if (!authenticatedUserId) return prisma.project.create({ data });
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.create({ data });
    await tx.projectMembership.create({
      data: { projectId: project.id, userId: authenticatedUserId, role: 'OWNER' }
    });
    return project;
  });
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

export async function createMilestone(prisma, projectId, overrides = {}) {
  // Todo marco pertence a uma sprint (ADR-010 D02). Sem sprint no override a
  // fixture cria a sua, para que cada teste continue declarando apenas o que
  // realmente lhe interessa.
  const sprintId = overrides.sprintId ?? (await createSprint(prisma, projectId)).id;
  return prisma.milestone.create({
    data: {
      projectId,
      title: `Marco artificial ${nextId()}`,
      dueDate: new Date('2026-08-14T00:00:00.000Z'),
      status: 'PENDENTE',
      ...overrides,
      sprintId
    }
  });
}

export async function createProjectMember(prisma, projectId, overrides = {}) {
  return prisma.projectMember.create({
    data: {
      projectId,
      name: `Pessoa artificial ${nextId()}`,
      email: `pessoa-${nextId()}@example.invalid`,
      role: 'MEMBRO',
      ...overrides
    }
  });
}

export async function createCommit(prisma, projectId, overrides = {}) {
  const unique = nextId();

  return prisma.commit.create({
    data: {
      projectId,
      hash: `fake-hash-${unique}`,
      message: `Commit artificial ${unique}`,
      authorName: 'Autor artificial',
      authorEmail: 'autor@example.invalid',
      branch: 'main',
      date: new Date('2026-01-10T12:00:00.000Z'),
      ...overrides
    }
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
