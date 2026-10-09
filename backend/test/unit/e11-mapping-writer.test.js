import { mkdtemp, mkdir, writeFile, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';

vi.mock('../../src/database/prismaClient.js', () => ({
  prisma: {
    $queryRawUnsafe: vi.fn().mockResolvedValue([{ COLUMN_NAME: 'projectMemberId' }]),
    $disconnect: vi.fn()
  }
}));
vi.mock('../../scripts/lib/e11-legacy-responsibility.js', async (importOriginal) => ({
  ...(await importOriginal()),
  auditE11LegacyResponsibilities: vi.fn().mockResolvedValue({
    state: {
      tasks: [
        { id: 10, projectId: 1, responsible: 'Private legacy name', responsibleUserId: null }
      ],
      memberships: []
    },
    audit: { counts: { tasksTextOnly: 1 } }
  })
}));

it('writes the legacy mapping only to an owner-only directory/file and repairs existing permissions', async () => {
  // The filesystem-only test must not depend on a developer's .env or suite order.
  vi.stubEnv('DATABASE_URL', 'mysql://localhost:3306/traceflow_unit_fixture');
  const directory = await mkdtemp(join(tmpdir(), 'traceflow-e11-writer-'));
  const local = join(directory, '.local');
  const path = join(local, 'e11-task-responsibility-mapping.json');
  await mkdir(local, { mode: 0o755 });
  await writeFile(path, JSON.stringify({ mappings: [{ taskId: 10, selectedUserId: 7 }] }), {
    mode: 0o644
  });
  const cwd = vi.spyOn(process, 'cwd').mockReturnValue(directory);
  const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  try {
    await import('../../scripts/e11-legacy-responsibility-audit.js');
    const mapping = JSON.parse(await readFile(path, 'utf8'));
    expect(mapping.mappings[0]).toMatchObject({
      taskId: 10,
      selectedUserId: 7,
      legacyResponsible: 'Private legacy name'
    });
    expect((await stat(local)).mode & 0o777).toBe(0o700);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(stdout.mock.calls.map(([line]) => line).join('')).not.toContain('Private legacy name');
  } finally {
    vi.unstubAllEnvs();
    stdout.mockRestore();
    cwd.mockRestore();
    await rm(directory, { recursive: true, force: true });
  }
});
