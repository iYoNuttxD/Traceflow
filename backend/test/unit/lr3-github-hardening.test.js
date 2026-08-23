import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(resolve('prisma/schema.prisma'), 'utf8');
const migration = readFileSync(
  resolve('prisma/migrations/20260820180000_lr3_github_hardening/migration.sql'),
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

  it('persiste somente evidência OWNER/ADMIN com validade e nunca token pessoal', () => {
    const authorization = schema.match(/model GitHubRepositoryAuthorization \{([\s\S]*?)\n\}/)?.[1];
    expect(authorization).toMatch(/permission\s+GitHubRepositoryPermission/);
    expect(authorization).toMatch(/expiresAt\s+DateTime/);
    expect(authorization).toMatch(/@@unique\(\[installationId, userId, githubRepositoryId\]/);
    expect(authorization).not.toMatch(/token|secret|credential/i);
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
