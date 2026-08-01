import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('cardinalidade GitHub App por repositório', () => {
  it('permite várias integrações por instalação e preserva unicidades de projeto/repositório', () => {
    const schema = readFileSync(resolve('prisma/schema.prisma'), 'utf8');
    const integration = schema.match(/model ProjectGitHubIntegration \{([\s\S]*?)\n\}/)?.[1];
    expect(integration).toContain('projectId          Int                     @unique');
    expect(integration).toContain('githubRepositoryId String?');
    expect(integration).toMatch(/githubRepositoryId\s+String\?\s+@unique/);
    expect(integration).not.toMatch(/installationId\s+Int\?\s+@unique/);
    expect(integration).not.toContain('@@unique([installationId])');
  });

  it('adiciona somente a unicidade do repositório em migration posterior à L1', () => {
    const migration = readFileSync(
      resolve('prisma/migrations/20260801160000_fix_github_repository_cardinality/migration.sql'),
      'utf8'
    );
    expect(migration).toContain('ProjectGitHubIntegration_githubRepositoryId_key');
    expect(migration).not.toMatch(/UNIQUE[^;]*installationId/i);
  });
});
