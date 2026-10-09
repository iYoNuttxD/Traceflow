import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { createProject } from '../fixtures/factories.js';

let prisma;

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  await cleanTestDatabase(prisma);
}, 60000);

afterEach(async () => {
  await cleanTestDatabase(prisma);
});

afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

describe('Correções S2-01 integração — branches longas (S201-A03)', () => {
  it('C1-02 branch de 512 caracteres é gravada e o nome continua sensível a caixa', async () => {
    const project = await createProject(prisma);
    const longName = `release/${'v'.repeat(504)}`;
    const branch = (name) => ({ projectId: project.id, name, lastSeenAt: new Date() });

    await prisma.gitBranch.create({ data: branch(longName) });
    await prisma.gitBranch.create({ data: branch('Feature/Login') });
    await prisma.gitBranch.create({ data: branch('feature/login') });

    expect(await prisma.gitBranch.count({ where: { projectId: project.id } })).toBe(3);
    const [column] = await prisma.$queryRawUnsafe(
      "SELECT COLUMN_TYPE AS columnType, COLLATION_NAME AS collation FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'GitBranch' AND COLUMN_NAME = 'name'"
    );
    expect(column).toEqual({ columnType: 'varchar(512)', collation: 'utf8mb4_bin' });
  });
});
