import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createCommit,
  createIssue,
  createMilestone,
  createPullRequest,
  createRequirement,
  createSprint,
  createTask
} from '../fixtures/factories.js';
import { startTestServer } from '../helpers/http-server.js';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { buildAuthorizationFixture } from './helpers/authorization-fixture.js';

let app;
let prisma;
let fixture;

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  const { default: instance } = await import('../../src/app.js');
  app = await startTestServer(instance);
  await cleanTestDatabase(prisma);
  fixture = await buildAuthorizationFixture(app, prisma);
}, 120_000);

afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

async function foreignResources() {
  const { accounts, other } = fixture;
  await prisma.projectMembership.create({
    data: { projectId: other.id, userId: accounts.owner.user.id, role: 'OWNER' }
  });
  const requirement = await createRequirement(prisma, other.id);
  const testCase = await accounts.owner.send('POST', `/api/projects/${other.id}/test-cases`, {
    title: 'Caso do projeto B',
    description: 'Descrição',
    preconditions: 'Pronto',
    expectedResult: 'Funciona',
    responsibleUserId: accounts.owner.user.id,
    requirementId: requirement.id,
    steps: [{ action: 'Abrir', expectedResult: 'Visível' }]
  });
  expect(testCase.status, testCase.text).toBe(201);
  const pullRequest = await createPullRequest(prisma, other.id);
  const execution = await accounts.owner.agent
    .post(`/api/test-cases/${testCase.body.testCase.id}/executions`)
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
  expect(execution.status, execution.text).toBe(201);
  return {
    requirement,
    pullRequest,
    task: await createTask(prisma, other.id),
    sprint: await createSprint(prisma, other.id),
    milestone: await createMilestone(prisma, other.id),
    commit: await createCommit(prisma, other.id),
    issue: await createIssue(prisma, other.id),
    executionStep: execution.body.execution.steps[0].id
  };
}

describe('H10 — vínculo com ID de outro projeto no corpo', () => {
  it('membro dos dois projetos não liga recurso do projeto A a recurso do projeto B', async () => {
    const { accounts, ids, project } = fixture;
    const foreign = await foreignResources();
    const outsiderId = accounts.outsider.user.id;
    const memberId = accounts.member.user.id;
    const testCase = (overrides) => ({
      title: 'Caso cruzado',
      description: 'Descrição',
      preconditions: 'Pronto',
      expectedResult: 'Funciona',
      responsibleUserId: memberId,
      requirementId: ids.requirement,
      steps: [{ action: 'Abrir', expectedResult: 'Visível' }],
      ...overrides
    });
    const defect = (overrides) => ({
      title: 'Defeito cruzado',
      description: 'Não visível',
      severity: 'MEDIA',
      responsibleUserId: memberId,
      requirementId: ids.requirement,
      detectedExecutionStepId: ids.executionStep,
      ...overrides
    });
    const attempts = [
      [
        'POST',
        `/api/projects/${project.id}/tasks`,
        { title: 'Cruzada', requirementId: foreign.requirement.id }
      ],
      [
        'POST',
        `/api/projects/${project.id}/tasks`,
        { title: 'Alheio', responsibleUserId: outsiderId }
      ],
      ['PUT', `/api/tasks/${ids.task}`, { requirementId: foreign.requirement.id }],
      ['PUT', `/api/tasks/${ids.task}`, { responsibleUserId: outsiderId }],
      ['PATCH', `/api/tasks/${ids.task}/requirement`, { requirementId: foreign.requirement.id }],
      ['PATCH', `/api/tasks/${ids.task}/sprint`, { sprintId: foreign.sprint.id }],
      ['PATCH', `/api/tasks/${ids.task}/pull-request`, { pullRequestId: foreign.pullRequest.id }],
      ['POST', `/api/tasks/${ids.task}/commits`, { commitId: foreign.commit.id }],
      ['POST', `/api/tasks/${ids.task}/issues`, { issueId: foreign.issue.id }],
      [
        'PATCH',
        `/api/tasks/${ids.task}/move`,
        { toStatus: 'EM_ANDAMENTO', responsibleUserId: outsiderId }
      ],
      ['PUT', `/api/requirements/${ids.requirement}/tasks`, { taskIds: [foreign.task.id] }],
      ['PUT', `/api/sprints/${ids.sprint}/tasks`, { taskIds: [foreign.task.id] }],
      [
        'POST',
        `/api/projects/${project.id}/sprints`,
        {
          name: 'Sprint cruzada',
          objective: 'Objetivo',
          startDate: '2026-09-01',
          endDate: '2026-09-14',
          milestoneId: foreign.milestone.id
        }
      ],
      ['PUT', `/api/sprints/${ids.sprint}`, { milestoneId: foreign.milestone.id }],
      [
        'POST',
        `/api/projects/${project.id}/test-cases`,
        testCase({ requirementId: foreign.requirement.id })
      ],
      [
        'POST',
        `/api/projects/${project.id}/test-cases`,
        testCase({ responsibleUserId: outsiderId })
      ],
      ['POST', `/api/projects/${project.id}/test-cases`, testCase({ taskIds: [foreign.task.id] })],
      [
        'POST',
        `/api/projects/${project.id}/defects`,
        defect({ requirementId: foreign.requirement.id })
      ],
      ['POST', `/api/projects/${project.id}/defects`, defect({ responsibleUserId: outsiderId })],
      ['POST', `/api/projects/${project.id}/defects`, defect({ originTaskIds: [foreign.task.id] })],
      [
        'POST',
        `/api/projects/${project.id}/defects`,
        defect({ detectedExecutionStepId: foreign.executionStep })
      ]
    ];
    const accepted = [];
    for (const [method, path, body] of attempts) {
      const response = await accounts.owner.send(method, path, body);
      if (response.status < 400 || response.status >= 500) {
        accepted.push(`${method} ${path} ${JSON.stringify(body)} -> ${response.status}`);
      }
    }
    expect(accepted).toEqual([]);
    const crossTasks = await prisma.task.count({
      where: {
        projectId: project.id,
        OR: [
          { requirementId: foreign.requirement.id },
          { sprintId: foreign.sprint.id },
          { pullRequestId: foreign.pullRequest.id },
          { responsibleUserId: outsiderId }
        ]
      }
    });
    expect(crossTasks).toBe(0);
    expect(
      await prisma.taskCommit.count({ where: { taskId: ids.task, commitId: foreign.commit.id } })
    ).toBe(0);
    expect(
      await prisma.taskIssue.count({ where: { taskId: ids.task, issueId: foreign.issue.id } })
    ).toBe(0);
  });
});

describe('H11 — recurso pessoal de outra conta no mesmo projeto', () => {
  it('notificação, sessão, preferência do painel e convite não vazam entre contas', async () => {
    const { accounts, ids, project } = fixture;
    const notification = await prisma.notification.create({
      data: {
        recipientUserId: accounts.member.user.id,
        projectId: project.id,
        taskId: ids.task,
        type: 'TASK_STATUS_CHANGED',
        dedupeKey: `conf-h11-${ids.task}`,
        taskTitle: 'Tarefa da varredura',
        fromStatus: 'A_FAZER',
        toStatus: 'EM_ANDAMENTO'
      }
    });
    const viewer = accounts.viewer;
    expect(
      (await viewer.send('PATCH', `/api/notifications/${notification.id}`, { read: true })).status
    ).toBe(404);
    const list = await viewer.send('GET', '/api/notifications');
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).not.toContain(`conf-h11-${ids.task}`);
    expect(
      (await prisma.notification.findUnique({ where: { id: notification.id } })).readAt
    ).toBeNull();

    const memberSession = await prisma.session.findFirst({
      where: { userId: accounts.member.user.id, revokedAt: null }
    });
    expect(
      (await viewer.send('DELETE', `/api/settings/security/sessions/${memberSession.publicId}`))
        .status
    ).toBe(404);
    expect((await accounts.member.send('GET', '/api/auth/me')).status).toBe(200);

    const preference = `/api/projects/${project.id}/indicator-preference`;
    expect(
      (
        await accounts.member.send('PUT', preference, {
          configurationVersion: 1,
          widgets: ['I01']
        })
      ).status
    ).toBe(200);
    const saved = await accounts.member.send('GET', preference);
    expect((await viewer.send('GET', preference)).body).not.toEqual(saved.body);
    const viewerPreference = await viewer.send('GET', preference);
    const pinned = await viewer.send('PATCH', preference, { pinnedToOverview: true });
    expect(pinned.status).toBe(200);
    expect(pinned.body).toMatchObject({
      widgets: viewerPreference.body.widgets,
      pinnedToOverview: true
    });
    expect((await viewer.send('GET', preference)).body).toEqual(pinned.body);
    expect((await accounts.member.send('GET', preference)).body).toEqual(saved.body);
    expect((await viewer.send('DELETE', preference)).status).toBeLessThan(500);
    expect((await accounts.member.send('GET', preference)).body).toEqual(saved.body);

    const invitation = await viewer.send(
      'POST',
      `/api/projects/invitations/${ids.invitation}/accept`
    );
    expect([403, 404]).toContain(invitation.status);
    expect(
      await prisma.projectInvitation.findUnique({ where: { id: ids.invitation } })
    ).toMatchObject({ acceptedAt: null, acceptedById: null, declinedAt: null });
    expect(
      await prisma.projectMembership.count({
        where: { projectId: project.id, userId: viewer.user.id, isActive: true }
      })
    ).toBe(1);
  });
});
