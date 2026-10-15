import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startTestServer } from '../helpers/http-server.js';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';

const boundary = vi.hoisted(() => ({
  client: null,
  installation: null,
  repository: null
}));
vi.mock('../../src/modules/github/github.client.js', () => ({
  githubInstallationClientFactory: { forInstallation: async () => boundary.client }
}));
vi.mock('../../src/modules/github/github-app.service.js', () => ({
  githubAppService: {
    resolveAuthorizedRepository: async () => ({
      installation: boundary.installation,
      repository: boundary.repository
    }),
    assertRepositoryAvailable: async () => null
  }
}));

let app;
let prisma;

async function* pages(...values) {
  for (const value of values) yield value;
}

const pullRequest = (number) => ({
  githubId: `pr-conformidade-${number}`,
  number,
  title: `PR ${number}`,
  state: 'open',
  targetBranch: 'main',
  mergedAtGithub: null,
  closedAtGithub: null
});

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  const { default: instance } = await import('../../src/app.js');
  app = await startTestServer(instance);
  await cleanTestDatabase(prisma);
  boundary.repository = {
    githubRepositoryId: '9231',
    name: 'repositorio-conformidade',
    owner: 'usuario-conformidade',
    fullName: 'usuario-conformidade/repositorio-conformidade',
    url: 'https://github.com/usuario-conformidade/repositorio-conformidade',
    defaultBranch: 'main',
    private: true,
    description: 'Repositório artificial da conformidade'
  };
  boundary.installation = await prisma.gitHubInstallation.create({
    data: {
      githubInstallationId: '923',
      accountId: '9230',
      accountLogin: 'usuario-conformidade',
      accountType: 'User',
      installedAt: new Date(),
      status: 'ACTIVE'
    }
  });
}, 60000);

afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

describe('H23 — exclusão do projeto durante a sincronização', () => {
  it('a execução para com PROJECT_DELETED e não grava a página seguinte', async () => {
    let reachedGate;
    let openGate;
    const atGate = new Promise((resolve) => {
      reachedGate = resolve;
    });
    const gate = new Promise((resolve) => {
      openGate = resolve;
    });
    async function* gatedPullRequests() {
      yield [pullRequest(1), pullRequest(2)];
      reachedGate();
      await gate;
      yield [pullRequest(3), pullRequest(4)];
    }
    boundary.client = {
      getRepository: vi.fn().mockResolvedValue(boundary.repository),
      listRepositoryPages: vi.fn(() => pages([boundary.repository])),
      listBranchPages: vi.fn(() => pages([{ name: 'main', headSha: 'main-head' }])),
      listCommitPages: vi.fn(() => pages([])),
      listPullRequestPages: vi.fn(() => gatedPullRequests()),
      listPullRequestLifecycleEventPages: vi.fn(() => pages([])),
      listIssuePages: vi.fn(() => pages([]))
    };
    const agent = request.agent(app);
    const registration = await agent.post('/api/auth/register').send({
      name: 'Pessoa da conformidade',
      username: 'conf-sincronizacao',
      email: 'conf-sincronizacao@example.invalid',
      password: 'SenhaSegura123!'
    });
    await request(app)
      .post('/api/auth/email-verification/verify')
      .send({ token: registration.body.emailVerification.testToken });
    const csrf = registration.body.csrfToken;
    const created = await agent.post('/api/projects/from-github').set('X-CSRF-Token', csrf).send({
      githubInstallationId: '923',
      githubRepositoryId: boundary.repository.githubRepositoryId,
      name: 'Projeto excluído durante a sincronização',
      responsibleTeam: 'Equipe'
    });
    expect(created.status, created.text).toBe(201);
    const projectId = created.body.project.id;
    await agent.post(`/api/projects/${projectId}/github/sync`).set('X-CSRF-Token', csrf).send({});
    await atGate;
    expect(await prisma.pullRequest.count({ where: { projectId } })).toBe(2);
    expect(
      (await agent.delete(`/api/projects/${projectId}`).set('X-CSRF-Token', csrf).send({})).status
    ).toBe(200);
    openGate();
    await vi.waitFor(
      async () => {
        const run = await prisma.gitHubSyncRun.findFirst({ where: { projectId } });
        expect(run).toMatchObject({ status: 'FAILED', errorCode: 'PROJECT_DELETED' });
      },
      { timeout: 20000, interval: 50 }
    );
    expect(await prisma.pullRequest.count({ where: { projectId } })).toBe(2);
  }, 60000);
});
