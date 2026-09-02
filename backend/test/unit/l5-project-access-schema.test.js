import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve('prisma/migrations/20260815230000_l5_1_project_access_invitations/migration.sql'),
  'utf8'
);

describe('migration L5.1 de código de acesso', () => {
  it('rotaciona capacidades legadas com 128 bits, aplica default e preserva dados', () => {
    expect(migration).toContain('RANDOM_BYTES(16)');
    expect(migration).toContain("DEFAULT 'MEMBER'");
    expect(migration).toContain("IN ('MEMBER', 'VIEWER')");
    expect(migration).toMatch(/MODIFY `accessCode` VARCHAR\(191\) NOT NULL/);
    expect(migration).not.toMatch(/\b(?:DELETE|DROP TABLE|TRUNCATE)\b/);
  });
});
