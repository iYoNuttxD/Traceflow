import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8');
const migration = readFileSync(
  new URL(
    '../../prisma/migrations/20260802120000_l2_account_security_privacy/migration.sql',
    import.meta.url
  ),
  'utf8'
);

describe('schema e migration incrementais da L2', () => {
  it('modela estados, troca de e-mail, reativação e ID público de sessão', () => {
    expect(schema).toContain('enum AccountStatus');
    expect(schema).toContain('model EmailChangeRequest');
    expect(schema).toContain('model AccountReactivationToken');
    expect(schema).toMatch(/publicId\s+String\s+@unique\s+@default\(uuid\(\)\)/);
  });

  it('faz backfill compatível sem apagar ou resetar dados', () => {
    expect(migration).toContain('UPDATE `Session` SET `publicId` = UUID()');
    expect(migration).toContain("WHEN `isActive` = true THEN 'ACTIVE' ELSE 'DEACTIVATED'");
    expect(migration).not.toMatch(/DROP TABLE|TRUNCATE|migrate reset/i);
  });
});
