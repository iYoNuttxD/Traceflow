import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';

let prisma;
let githubRepository;

beforeAll(async () => {
  const url = configureTestDatabaseEnvironment();
  deployTestMigrations(url);
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ githubRepository } = await import('../../src/modules/github/github.repository.js'));
});

beforeEach(() => cleanTestDatabase(prisma));

afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

async function createFixture(repositoryIds = ['501', '502', '503']) {
  const user = await prisma.user.create({
    data: {
      name: 'Owner cardinalidade',
      username: 'owner-cardinalidade',
      email: 'owner-cardinality@example.invalid',
      passwordHash: 'fixture-only',
      emailVerifiedAt: new Date()
    }
  });
  const installation = await prisma.gitHubInstallation.create({
    data: {
      githubInstallationId: '77',
      accountId: '700',
      accountLogin: 'traceflow',
      accountType: 'Organization',
      installedAt: new Date(),
      status: 'ACTIVE'
    }
  });
  const projects = [];
  for (const repositoryId of repositoryIds) {
    const project = await prisma.project.create({
      data: {
        name: `Projeto ${repositoryId}`,
        responsibleTeam: 'Equipe cardinalidade',
        githubRepositoryId: repositoryId,
        githubRepositoryFullName: `traceflow/repo-${repositoryId}`
      }
    });
    await prisma.projectMembership.create({
      data: { projectId: project.id, userId: user.id, role: 'OWNER' }
    });
    await prisma.projectGitHubIntegration.create({
      data: {
        projectId: project.id,
        installationId: installation.id,
        githubRepositoryId: repositoryId,
        repositoryName: `repo-${repositoryId}`,
        repositoryFullName: `traceflow/repo-${repositoryId}`,
        status: 'ACTIVE'
      }
    });
    projects.push(project);
  }
  return { installation, projects };
}

describe('cardinalidade persistida da GitHub App', () => {
  it('consome state e persiste instalação e autorização sem armazenar tokens', async () => {
    const user = await prisma.user.create({
      data: {
        name: 'Owner callback',
        username: 'owner-callback',
        email: 'owner-callback@example.invalid',
        passwordHash: 'fixture-only',
        emailVerifiedAt: new Date()
      }
    });
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: 'session-hash-callback',
        csrfTokenHash: 'csrf-hash-callback',
        sessionVersion: user.sessionVersion,
        expiresAt: new Date(Date.now() + 60_000)
      }
    });
    const state = await prisma.gitHubAppConnectionState.create({
      data: {
        userId: user.id,
        sessionId: session.id,
        tokenHash: 'state-hash-callback',
        intendedAction: 'CREATE_PROJECT',
        expiresAt: new Date(Date.now() + 60_000)
      }
    });
    const result = await githubRepository.authorizeInstallationFromState({
      stateId: state.id,
      now: new Date(),
      userId: user.id,
      installation: {
        githubInstallationId: '77',
        accountId: '700',
        accountLogin: 'traceflow',
        accountType: 'Organization',
        installedAt: new Date()
      }
    });
    const { installation } = result;

    expect(installation).toMatchObject({ githubInstallationId: '77', status: 'ACTIVE' });
    expect(
      await prisma.gitHubInstallationAuthorization.findUnique({
        where: { installationId_userId: { installationId: installation.id, userId: user.id } }
      })
    ).toMatchObject({ userId: user.id, installationId: installation.id });
    expect(
      await prisma.gitHubAppConnectionState.findUnique({ where: { id: state.id } })
    ).toMatchObject({ usedAt: expect.any(Date) });
    await expect(
      githubRepository.authorizeInstallationFromState({
        stateId: state.id,
        now: new Date(),
        userId: user.id,
        installation: { githubInstallationId: '77' }
      })
    ).resolves.toBeNull();
    expect(
      JSON.stringify(await prisma.gitHubInstallation.findUnique({ where: { id: installation.id } }))
    ).not.toMatch(/accessToken|userToken|installationToken/);
  });

  it('autoriza pelo ID interno quando o webhook criou a instalação primeiro', async () => {
    const user = await prisma.user.create({
      data: {
        name: 'Owner webhook first',
        username: 'owner-webhook-first',
        email: 'owner-webhook-first@example.invalid',
        passwordHash: 'fixture-only',
        emailVerifiedAt: new Date()
      }
    });
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: 'session-webhook-first',
        csrfTokenHash: 'csrf-webhook-first',
        sessionVersion: user.sessionVersion,
        expiresAt: new Date(Date.now() + 60_000)
      }
    });
    const state = await prisma.gitHubAppConnectionState.create({
      data: {
        userId: user.id,
        sessionId: session.id,
        tokenHash: 'state-webhook-first',
        intendedAction: 'CREATE_PROJECT',
        expiresAt: new Date(Date.now() + 60_000)
      }
    });
    const existing = await githubRepository.upsertInstallationFromWebhook('150628891', {
      account: { id: 700, login: 'traceflow', type: 'Organization' }
    });

    const result = await githubRepository.authorizeInstallationFromState({
      stateId: state.id,
      now: new Date(),
      userId: user.id,
      installation: {
        githubInstallationId: '150628891',
        accountId: '700',
        accountLogin: 'traceflow',
        accountType: 'Organization',
        installedAt: new Date()
      }
    });
    const authorization = await prisma.gitHubInstallationAuthorization.findFirst({
      where: { userId: user.id }
    });

    expect(result.installation.id).toBe(existing.id);
    expect(authorization).toMatchObject({ installationId: existing.id, userId: user.id });
    expect(authorization.installationId).not.toBe(Number(existing.githubInstallationId));
    await expect(githubRepository.listAuthorizedInstallations(user.id)).resolves.toEqual([
      expect.objectContaining({ id: existing.id })
    ]);
    await expect(githubRepository.listAuthorizedInstallations(user.id + 1000)).resolves.toEqual([]);

    const retryState = await prisma.gitHubAppConnectionState.create({
      data: {
        userId: user.id,
        sessionId: session.id,
        tokenHash: 'state-webhook-first-retry',
        intendedAction: 'CREATE_PROJECT',
        expiresAt: new Date(Date.now() + 60_000)
      }
    });
    await expect(
      githubRepository.authorizeInstallationFromState({
        stateId: retryState.id,
        now: new Date(),
        userId: user.id,
        installation: {
          githubInstallationId: '150628891',
          accountId: '700',
          accountLogin: 'traceflow',
          accountType: 'Organization',
          installedAt: new Date()
        }
      })
    ).resolves.toMatchObject({ installation: { id: existing.id } });
    await expect(
      prisma.gitHubInstallationAuthorization.count({
        where: { installationId: existing.id, userId: user.id }
      })
    ).resolves.toBe(1);
  });

  it('cria instalação antes do webhook e preserva autorização no upsert posterior', async () => {
    const user = await prisma.user.create({
      data: {
        name: 'Owner callback first',
        username: 'owner-callback-first',
        email: 'owner-callback-first@example.invalid',
        passwordHash: 'fixture-only',
        emailVerifiedAt: new Date()
      }
    });
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: 'session-callback-first',
        csrfTokenHash: 'csrf-callback-first',
        sessionVersion: user.sessionVersion,
        expiresAt: new Date(Date.now() + 60_000)
      }
    });
    const state = await prisma.gitHubAppConnectionState.create({
      data: {
        userId: user.id,
        sessionId: session.id,
        tokenHash: 'state-callback-first',
        intendedAction: 'CREATE_PROJECT',
        expiresAt: new Date(Date.now() + 60_000)
      }
    });
    const result = await githubRepository.authorizeInstallationFromState({
      stateId: state.id,
      now: new Date(),
      userId: user.id,
      installation: {
        githubInstallationId: '150628891',
        accountId: '700',
        accountLogin: 'traceflow',
        accountType: 'Organization',
        installedAt: new Date()
      }
    });

    const webhookInstallation = await githubRepository.upsertInstallationFromWebhook('150628891', {
      account: { id: 700, login: 'traceflow-updated', type: 'Organization' }
    });
    expect(webhookInstallation.id).toBe(result.installation.id);
    await expect(
      prisma.gitHubInstallationAuthorization.findUnique({
        where: {
          installationId_userId: { installationId: result.installation.id, userId: user.id }
        }
      })
    ).resolves.toMatchObject({ installationId: result.installation.id, userId: user.id });
  });

  it('reverte instalação e autorização quando o state não pode ser consumido', async () => {
    const user = await prisma.user.create({
      data: {
        name: 'Owner rollback',
        username: 'owner-rollback',
        email: 'owner-rollback@example.invalid',
        passwordHash: 'fixture-only',
        emailVerifiedAt: new Date()
      }
    });
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: 'session-rollback',
        csrfTokenHash: 'csrf-rollback',
        sessionVersion: user.sessionVersion,
        expiresAt: new Date(Date.now() + 60_000)
      }
    });
    const state = await prisma.gitHubAppConnectionState.create({
      data: {
        userId: user.id,
        sessionId: session.id,
        tokenHash: 'state-rollback',
        intendedAction: 'CREATE_PROJECT',
        expiresAt: new Date(Date.now() + 60_000)
      }
    });

    await expect(
      githubRepository.authorizeInstallationFromState({
        stateId: state.id,
        now: new Date(),
        userId: user.id,
        installation: {
          githubInstallationId: '999999',
          accountLogin: 'traceflow',
          accountType: 'Organization',
          installedAt: new Date()
        }
      })
    ).rejects.toMatchObject({ callbackStep: 'upsert_installation' });
    await expect(
      prisma.gitHubInstallation.findUnique({ where: { githubInstallationId: '999999' } })
    ).resolves.toBeNull();
    await expect(
      prisma.gitHubInstallationAuthorization.findFirst({ where: { userId: user.id } })
    ).resolves.toBeNull();
    await expect(
      prisma.gitHubAppConnectionState.findUnique({ where: { id: state.id } })
    ).resolves.toMatchObject({ usedAt: null });
  });

  it('permite três projetos/repositórios na mesma instalação', async () => {
    const { installation, projects } = await createFixture();
    const integrations = await prisma.projectGitHubIntegration.findMany({
      where: { installationId: installation.id }
    });
    expect(integrations).toHaveLength(3);
    expect(new Set(integrations.map(({ projectId }) => projectId))).toEqual(
      new Set(projects.map(({ id }) => id))
    );
  });

  it('impede segundo repositório no mesmo projeto e o mesmo repositório em outro projeto', async () => {
    const { installation, projects } = await createFixture(['501']);
    await expect(
      prisma.projectGitHubIntegration.create({
        data: {
          projectId: projects[0].id,
          installationId: installation.id,
          githubRepositoryId: '502',
          status: 'ACTIVE'
        }
      })
    ).rejects.toMatchObject({ code: 'P2002' });

    const other = await prisma.project.create({
      data: { name: 'Outro projeto', responsibleTeam: 'Equipe cardinalidade' }
    });
    await expect(
      prisma.projectGitHubIntegration.create({
        data: {
          projectId: other.id,
          installationId: installation.id,
          githubRepositoryId: '501',
          status: 'ACTIVE'
        }
      })
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('remove acesso de um repositório sem afetar integrações ou artifacts dos demais', async () => {
    const { projects } = await createFixture(['501', '502']);
    await prisma.commit.create({
      data: { projectId: projects[0].id, hash: 'commit-501', message: 'Preservar 501' }
    });
    await prisma.issue.create({
      data: {
        projectId: projects[0].id,
        githubId: 'issue-501',
        number: 1,
        title: 'Preservar issue',
        labels: []
      }
    });
    await githubRepository.requireReconnectForRepositories(77, [501]);

    const integrations = await prisma.projectGitHubIntegration.findMany({
      orderBy: { githubRepositoryId: 'asc' }
    });
    expect(integrations[0]).toMatchObject({
      githubRepositoryId: '501',
      status: 'RECONNECT_REQUIRED',
      lastSyncStatus: 'BLOQUEADO'
    });
    expect(integrations[1]).toMatchObject({ githubRepositoryId: '502', status: 'ACTIVE' });
    expect(await prisma.commit.count({ where: { projectId: projects[0].id } })).toBe(1);
    expect(await prisma.issue.count({ where: { projectId: projects[0].id } })).toBe(1);
  });

  it('possui UNIQUE(projectId) e UNIQUE(githubRepositoryId), nunca UNIQUE(installationId)', async () => {
    const indexes = await prisma.$queryRaw`
      SELECT INDEX_NAME AS indexName, COLUMN_NAME AS columnName, NON_UNIQUE AS nonUnique
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'ProjectGitHubIntegration'
      ORDER BY INDEX_NAME, SEQ_IN_INDEX
    `;
    const uniqueColumns = indexes
      .filter(({ nonUnique }) => Number(nonUnique) === 0)
      .map(({ columnName }) => columnName);
    expect(uniqueColumns).toContain('projectId');
    expect(uniqueColumns).toContain('githubRepositoryId');
    expect(uniqueColumns).not.toContain('installationId');
  });
});
