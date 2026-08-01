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
