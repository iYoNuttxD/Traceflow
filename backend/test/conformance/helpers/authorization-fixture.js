import request from 'supertest';
import {
  createCommit,
  createIssue,
  createMilestone,
  createProject,
  createPullRequest,
  createRequirement,
  createSprint,
  createTask
} from '../../fixtures/factories.js';

const password = 'SenhaSegura123!';

export async function registerAccount(app, tag) {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({
    name: `Conformidade ${tag}`,
    username: `conf-${tag}`,
    email: `conf-${tag}@example.invalid`,
    password
  });
  if (response.status !== 201)
    throw new Error(`cadastro ${tag}: ${response.status} ${response.text}`);
  const verification = await request(app)
    .post('/api/auth/email-verification/verify')
    .send({ token: response.body.emailVerification.testToken });
  if (verification.status !== 200) throw new Error(`verificação ${tag}: ${verification.status}`);
  const csrf = response.body.csrfToken;
  return {
    agent,
    csrf,
    user: response.body.user,
    send(method, path, body = {}) {
      const call = agent[method.toLowerCase()](path);
      return method === 'GET' ? call : call.set('X-CSRF-Token', csrf).send(body);
    }
  };
}

export async function buildAuthorizationFixture(app, prisma) {
  const accounts = {};
  for (const tag of ['owner', 'manager', 'member', 'viewer', 'outsider']) {
    accounts[tag] = await registerAccount(app, tag);
  }
  const project = await createProject(prisma, { name: 'Projeto A da varredura' });
  const other = await createProject(prisma, { name: 'Projeto B da varredura' });
  const roles = { owner: 'OWNER', manager: 'MANAGER', member: 'MEMBER', viewer: 'VIEWER' };
  for (const [tag, role] of Object.entries(roles)) {
    await prisma.projectMembership.create({
      data: { projectId: project.id, userId: accounts[tag].user.id, role }
    });
  }
  await prisma.projectMembership.create({
    data: { projectId: other.id, userId: accounts.outsider.user.id, role: 'OWNER' }
  });
  const membership = await prisma.projectMembership.findUnique({
    where: { projectId_userId: { projectId: project.id, userId: accounts.viewer.user.id } }
  });
  const requirement = await createRequirement(prisma, project.id);
  const task = await createTask(prisma, project.id, { requirementId: requirement.id });
  const sprint = await createSprint(prisma, project.id);
  const milestone = await createMilestone(prisma, project.id);
  const commit = await createCommit(prisma, project.id);
  const suggestedCommit = await createCommit(prisma, project.id);
  const pullRequest = await createPullRequest(prisma, project.id);
  const issue = await createIssue(prisma, project.id);
  await prisma.taskCommit.create({ data: { taskId: task.id, commitId: commit.id } });
  await prisma.taskIssue.create({ data: { taskId: task.id, issueId: issue.id } });
  const comment = await prisma.taskComment.create({
    data: {
      projectId: project.id,
      taskId: task.id,
      authorUserId: accounts.member.user.id,
      content: 'Comentário do membro'
    }
  });
  const ownerComment = await prisma.taskComment.create({
    data: {
      projectId: project.id,
      taskId: task.id,
      authorUserId: accounts.owner.user.id,
      content: 'Comentário do dono'
    }
  });
  const entry = await prisma.taskTimeEntry.create({
    data: {
      projectId: project.id,
      taskId: task.id,
      startedAt: new Date(Date.now() - 2 * 3600_000),
      endedAt: new Date(Date.now() - 3600_000),
      startedById: accounts.member.user.id
    }
  });
  const ownerEntry = await prisma.taskTimeEntry.create({
    data: {
      projectId: project.id,
      taskId: task.id,
      startedAt: new Date(Date.now() - 4 * 3600_000),
      endedAt: new Date(Date.now() - 3 * 3600_000),
      startedById: accounts.owner.user.id
    }
  });
  const alert = await prisma.traceabilityAlert.create({
    data: {
      projectId: project.id,
      type: 'TASK_CONCLUDED_WITHOUT_COMMIT',
      dedupeKey: `conf-${task.id}`,
      subjectCode: `T-${task.id}`,
      subjectTitle: task.title,
      taskId: task.id
    }
  });
  const suggestion = await prisma.taskCommitSuggestion.create({
    data: { projectId: project.id, taskId: task.id, commitId: suggestedCommit.id }
  });
  const invitation = await prisma.projectInvitation.create({
    data: {
      projectId: project.id,
      email: 'convidado-varredura@example.invalid',
      tokenHash: 'c'.repeat(64),
      expiresAt: new Date(Date.now() + 86_400_000),
      createdById: accounts.owner.user.id
    }
  });
  const testCaseResponse = await accounts.owner.send(
    'POST',
    `/api/projects/${project.id}/test-cases`,
    {
      title: 'Caso da varredura',
      description: 'Descrição',
      preconditions: 'Pronto',
      expectedResult: 'Funciona',
      responsibleUserId: accounts.member.user.id,
      requirementId: requirement.id,
      steps: [{ action: 'Abrir', expectedResult: 'Visível' }]
    }
  );
  if (testCaseResponse.status !== 201) throw new Error(`caso de teste: ${testCaseResponse.text}`);
  const testCase = testCaseResponse.body.testCase;
  const executionResponse = await accounts.owner.agent
    .post(`/api/test-cases/${testCase.id}/executions`)
    .set('X-CSRF-Token', accounts.owner.csrf)
    .field(
      'payload',
      JSON.stringify({
        testCaseVersion: 1,
        environment: 'LOCAL',
        testedReference: { type: 'PULL_REQUEST', id: pullRequest.id },
        steps: [{ position: 1, result: 'FAIL', observedResult: 'Não visível' }]
      })
    );
  if (executionResponse.status !== 201) throw new Error(`execução: ${executionResponse.text}`);
  const execution = executionResponse.body.execution;
  const defectResponse = await accounts.owner.send('POST', `/api/projects/${project.id}/defects`, {
    title: 'Defeito da varredura',
    description: 'Não visível',
    severity: 'MEDIA',
    responsibleUserId: accounts.member.user.id,
    requirementId: requirement.id,
    detectedExecutionStepId: execution.steps[0].id
  });
  if (defectResponse.status !== 201) throw new Error(`defeito: ${defectResponse.text}`);
  return {
    accounts,
    project,
    other,
    ids: {
      project: project.id,
      requirement: requirement.id,
      task: task.id,
      sprint: sprint.id,
      milestone: milestone.id,
      commit: commit.id,
      pullRequest: pullRequest.id,
      issue: issue.id,
      comment: comment.id,
      ownerComment: ownerComment.id,
      entry: entry.id,
      ownerEntry: ownerEntry.id,
      alert: alert.id,
      suggestion: suggestion.id,
      membership: membership.id,
      invitation: invitation.id,
      testCase: testCase.id,
      execution: execution.id,
      executionStep: execution.steps[0].id,
      defect: defectResponse.body.defect.id
    }
  };
}

const resourceByPrefix = {
  projects: 'project',
  tasks: 'task',
  requirements: 'requirement',
  sprints: 'sprint',
  milestones: 'milestone',
  'test-cases': 'testCase',
  defects: 'defect',
  'test-executions': 'execution'
};

export const projectScopedRoute = (path) =>
  path.includes(':projectId') ||
  /^\/api\/(?:projects|tasks|requirements|sprints|milestones|test-cases|defects|test-executions|test-evidence)\/:id(?:\/|$)/.test(
    path
  );

export function concreteRoute(path, ids) {
  const prefix = /^\/api\/([a-z-]+)\/:id(?:\/|$)/.exec(path)?.[1];
  const values = {
    projectId: ids.project,
    id: ids[resourceByPrefix[prefix]],
    taskId: ids.task,
    requirementId: ids.requirement,
    commentId: ids.comment,
    commitId: ids.commit,
    issueId: ids.issue,
    entryId: ids.entry,
    alertId: ids.alert,
    suggestionId: ids.suggestion,
    membershipId: ids.membership,
    invitationId: ids.invitation,
    artifactType: 'commit',
    artifactId: ids.commit
  };
  return path.replace(/:([A-Za-z]+)/g, (_, name) => String(values[name] ?? 999_999_999));
}

export const percentEncodeIds = (path) =>
  path.replace(
    /\/(\d+)(?=\/|$)/g,
    (_, digits) => `/${[...digits].map((digit) => `%${digit.charCodeAt(0).toString(16)}`).join('')}`
  );
