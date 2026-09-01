import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(resolve('prisma/schema.prisma'), 'utf8');
const migration = readFileSync(
  resolve('prisma/migrations/20260808120000_l1_1_github_identity_login/migration.sql'),
  'utf8'
);
const privacyMigration = readFileSync(
  resolve('prisma/migrations/20260820220000_lr4_privacy_lifecycle_hardening/migration.sql'),
  'utf8'
);
const repositoryAuthorizationMigration = readFileSync(
  resolve(
    'prisma/migrations/20260821180000_lr3_1_github_repository_authorization_migration/migration.sql'
  ),
  'utf8'
);
const decouplingMigration = readFileSync(
  resolve('prisma/migrations/20260824120000_lr9_github_oauth_app_decoupling/migration.sql'),
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

  it('mantém tombstone pseudonimizado sem GitHub ID bruto ou vínculo de usuário', () => {
    const tombstone = schema.match(/model GitHubIdentityTombstone \{([\s\S]*?)\n\}/)?.[1];
    expect(tombstone).toMatch(/githubUserFingerprint\s+String\s+@unique/);
    expect(tombstone).not.toMatch(/githubUserId|userId|accessToken|refreshToken/i);
    expect(privacyMigration).toContain('CREATE TABLE `GitHubIdentityTombstone`');
    expect(privacyMigration).not.toMatch(/DROP TABLE|TRUNCATE|DELETE FROM/i);
  });

  it('preserva a migration histórica e remove o snapshot pessoal somente por migration incremental', () => {
    expect(repositoryAuthorizationMigration).toContain("'REPOSITORY_AUTHORIZATION'");
    expect(repositoryAuthorizationMigration).not.toMatch(/UPDATE|DELETE|DROP|TRUNCATE/i);
    expect(schema).not.toContain('REPOSITORY_AUTHORIZATION');
    expect(schema).not.toContain('GitHubRepositoryAuthorization');
    expect(schema).not.toContain('repositoryAuthorizationExpiresAt');
    expect(decouplingMigration).toContain('DROP TABLE `GitHubRepositoryAuthorization`');
    expect(decouplingMigration).toContain('DELETE FROM `GitHubOAuthState`');
    expect(decouplingMigration).toMatch(
      /ENUM\(\s*'LOGIN',\s*'LINK_IDENTITY',\s*'REAUTH_SENSITIVE_ACTION'\s*\)/
    );
  });
});
