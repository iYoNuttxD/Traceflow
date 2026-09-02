import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(resolve('prisma/schema.prisma'), 'utf8');
const migration = readFileSync(
  resolve('prisma/migrations/20260820180000_lr3_github_hardening/migration.sql'),
  'utf8'
);
const decouplingMigration = readFileSync(
  resolve('prisma/migrations/20260824120000_lr9_github_oauth_app_decoupling/migration.sql'),
  'utf8'
);

describe('contratos persistidos LR.3', () => {
  it('modela lifecycle canônico sem estado DELETED no schema atual', () => {
    const lifecycle = schema.match(/enum GitHubInstallationStatus \{([\s\S]*?)\n\}/)?.[1];
    expect(lifecycle).toContain('PENDING');
    expect(lifecycle).toContain('ACTIVE');
    expect(lifecycle).toContain('SUSPENDED');
    expect(lifecycle).toContain('REMOVED');
    expect(lifecycle).not.toContain('DELETED');
  });

  it('converte DELETED antes de contrair o enum e preserva migrations históricas', () => {
    const expand = migration.indexOf("'DELETED', 'REMOVED'");
    const convert = migration.indexOf("SET `status` = 'REMOVED'");
    const contract = migration.lastIndexOf("'SUSPENDED', 'REMOVED'");
    expect(expand).toBeGreaterThanOrEqual(0);
    expect(convert).toBeGreaterThan(expand);
    expect(contract).toBeGreaterThan(convert);
    expect(migration).not.toMatch(/DROP TABLE `Project|DROP TABLE `Commit|TRUNCATE/i);
  });

  it('mantém a evidência LR.3 apenas no histórico e a remove do modelo vigente na LR.9', () => {
    expect(migration).toContain('CREATE TABLE `GitHubRepositoryAuthorization`');
    expect(schema).not.toContain('model GitHubRepositoryAuthorization');
    expect(schema).not.toContain('GitHubRepositoryPermission');
    expect(decouplingMigration).toContain('DROP TABLE `GitHubRepositoryAuthorization`');
    expect(decouplingMigration).not.toMatch(
      /DROP TABLE `GitHubInstallation`|DROP TABLE `ProjectGitHubIntegration`/
    );
  });

  it('mantém estado de processamento e retry idempotente por deliveryId', () => {
    const delivery = schema.match(/model GitHubWebhookDelivery \{([\s\S]*?)\n\}/)?.[1];
    expect(delivery).toMatch(/deliveryId\s+String\s+@unique/);
    expect(delivery).toMatch(/status\s+GitHubWebhookDeliveryStatus/);
    expect(delivery).toMatch(/attemptCount\s+Int/);
    expect(delivery).toContain('failureStep');
    expect(delivery).toContain('failureCode');
  });
});
