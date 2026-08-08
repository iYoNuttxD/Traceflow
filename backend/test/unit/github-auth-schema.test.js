import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(resolve('prisma/schema.prisma'), 'utf8');
const migration = readFileSync(
  resolve('prisma/migrations/20260808120000_l1_1_github_identity_login/migration.sql'),
  'utf8'
);

describe('schema incremental da autenticação GitHub L1.1', () => {
  it('mantém identidade 1:0..1 separada de instalações e com IDs únicos', () => {
    const identity = schema.match(/model GitHubIdentity \{([\s\S]*?)\n\}/)?.[1];
    expect(identity).toMatch(/userId\s+Int\s+@unique/);
    expect(identity).toMatch(/githubUserId\s+String\s+@unique/);
    expect(identity).not.toMatch(/installation|accessToken|refreshToken/i);
  });

  it('modela purpose, expiração, uso único, sessão e reautenticação sem persistir tokens OAuth', () => {
    const state = schema.match(/model GitHubOAuthState \{([\s\S]*?)\n\}/)?.[1];
    expect(schema).toContain('enum GitHubOAuthPurpose');
    expect(state).toMatch(/tokenHash\s+String\s+@unique/);
    expect(state).toMatch(/purpose\s+GitHubOAuthPurpose/);
    expect(state).toContain('sessionId');
    expect(state).toContain('expiresAt');
    expect(state).toContain('usedAt');
    expect(state).not.toMatch(/codeVerifier|accessToken|refreshToken/i);
    expect(schema).toMatch(/lastReauthenticatedAt\s+DateTime\?/);
  });

  it('usa migration nova e não altera ou reseta dados históricos', () => {
    expect(migration).toContain('CREATE TABLE `GitHubIdentity`');
    expect(migration).toContain('CREATE TABLE `GitHubOAuthState`');
    expect(migration).not.toMatch(/DROP TABLE|TRUNCATE|DELETE FROM|UPDATE `User`/i);
  });
});
