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

  it('não oferece campos para persistir tokens temporários da GitHub App', () => {
    const schema = readFileSync(resolve('prisma/schema.prisma'), 'utf8');
    const githubModels = [
      'GitHubInstallation',
      'GitHubInstallationAuthorization',
      'GitHubAppConnectionState'
    ].map((model) => schema.match(new RegExp(`model ${model} \\{([\\s\\S]*?)\\n\\}`))?.[1]);
    for (const model of githubModels) {
      expect(model).toBeTruthy();
      expect(model).not.toMatch(/accessToken|userToken|installationToken/i);
    }
  });

  it('mantém HMAC sobre raw body e comparação constant-time', () => {
    const service = readFileSync(resolve('src/modules/github/github-app.service.js'), 'utf8');
    const app = readFileSync(resolve('src/app.js'), 'utf8');
    expect(service).toContain('timingSafeEqual(expected, actual)');
    expect(service).toContain("createHmac('sha256', env.githubAppWebhookSecret).update(rawBody)");
    expect(service).not.toContain('JSON.stringify(req.body)');
    expect(app.indexOf("express.raw({ type: 'application/json'")).toBeLessThan(
      app.indexOf('express.json(')
    );
  });

  it('valida callback apenas por GET /user/installations sem username ou log de token', () => {
    const provider = readFileSync(
      resolve('src/modules/github/github-credential.provider.js'),
      'utf8'
    );
    const service = readFileSync(resolve('src/modules/github/github-app.service.js'), 'utf8');
    expect(provider).toContain("client.request('GET /user/installations'");
    expect(`${provider}\n${service}`).not.toMatch(/users\/.*installation|getUserInstallation/);
    expect(provider).not.toMatch(/logger|console\./);
  });
});
