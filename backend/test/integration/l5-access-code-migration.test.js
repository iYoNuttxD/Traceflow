import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { expect, it } from 'vitest';
import { configureTestDatabaseEnvironment } from '../helpers/test-database.js';

it('executes L5.1 against legacy rows, preserves identity and enforces allowed roles', async () => {
  const url = new URL(configureTestDatabaseEnvironment());
  url.searchParams.set('connection_limit', '1');
  const client = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  try {
    // Connection-local shadow table: the current migrated Project table is never altered.
    await client.$executeRawUnsafe(
      'CREATE TEMPORARY TABLE Project (id INT PRIMARY KEY, name VARCHAR(191), accessCode VARCHAR(191), inviteLink VARCHAR(191))'
    );
    await client.$executeRawUnsafe(
      "INSERT INTO Project VALUES (1, 'Preserved A', 'LEGACY-A', 'https://legacy.test/a'), (2, 'Preserved B', NULL, NULL)"
    );
    // Check names are schema-global even for temporary tables. Only rename that identifier.
    const sql = readFileSync(
      'prisma/migrations/20260815230000_l5_1_project_access_invitations/migration.sql',
      'utf8'
    ).replaceAll('`Project_accessCodeRole_allowed`', '`TestLegacyProject_accessCodeRole_allowed`');
    for (const statement of sql
      .replace(/^--.*$/gm, '')
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean))
      await client.$executeRawUnsafe(statement);
    const rows = await client.$queryRawUnsafe('SELECT * FROM Project ORDER BY id');
    expect(rows).toEqual([
      {
        id: 1,
        name: 'Preserved A',
        accessCode: expect.stringMatching(/^TRC-[0-9A-F]{32}$/),
        inviteLink: null,
        accessCodeRole: 'MEMBER'
      },
      {
        id: 2,
        name: 'Preserved B',
        accessCode: expect.stringMatching(/^TRC-[0-9A-F]{32}$/),
        inviteLink: null,
        accessCodeRole: 'MEMBER'
      }
    ]);
    expect(new Set(rows.map((row) => row.accessCode)).size).toBe(2);
    await client.$executeRawUnsafe("UPDATE Project SET accessCodeRole = 'VIEWER' WHERE id = 1");
    await expect(
      client.$executeRawUnsafe("UPDATE Project SET accessCodeRole = 'OWNER' WHERE id = 1")
    ).rejects.toMatchObject({ code: 'P2010', meta: expect.objectContaining({ code: '3819' }) });
    await expect(
      client.$executeRawUnsafe('UPDATE Project SET accessCode = NULL WHERE id = 1')
    ).rejects.toMatchObject({ code: 'P2010', meta: expect.objectContaining({ code: '1048' }) });
    expect(
      await client.$queryRawUnsafe('SELECT id, name, accessCodeRole FROM Project ORDER BY id')
    ).toEqual([
      { id: 1, name: 'Preserved A', accessCodeRole: 'VIEWER' },
      { id: 2, name: 'Preserved B', accessCodeRole: 'MEMBER' }
    ]);
  } finally {
    await client.$executeRawUnsafe('DROP TEMPORARY TABLE IF EXISTS Project');
    await client.$disconnect();
  }
});
