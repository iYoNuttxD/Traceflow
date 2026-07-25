import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkArchitecture, extractImportSpecifiers } from '../../scripts/check-architecture.js';

describe('verificador de fronteiras arquiteturais', () => {
  it('extrai imports e reexports estáticos', () => {
    expect(
      extractImportSpecifiers("import value from './value.js'; export { item } from './item.js';")
    ).toEqual(['./value.js', './item.js']);
  });

  it('aprova as fontes atuais do backend e frontend', () => {
    expect(
      checkArchitecture({
        backendRoot: resolve(process.cwd(), 'src'),
        frontendRoot: resolve(process.cwd(), '../frontend/src')
      })
    ).toEqual([]);
  });

  it('detecta imports proibidos e ciclo na fixture controlada', () => {
    const violations = checkArchitecture({
      backendRoot: resolve(process.cwd(), 'test/fixtures/architecture/invalid'),
      frontendRoot: resolve(process.cwd(), 'test/fixtures/architecture/empty-frontend')
    });
    const rules = violations.map((violation) => violation.rule);

    expect(rules).toContain('route-no-repository');
    expect(rules).toContain('controller-no-repository');
    expect(rules).toContain('repository-no-controller');
    expect(rules).toContain('module-no-cycle');
    expect(rules).toContain('shared-no-domain');
    expect(rules).toContain('middleware-no-repository');
    expect(rules).toContain('logger-no-express');
    expect(rules).toContain('error-handler-no-domain-service');
    expect(rules).toContain('frontend-shared-no-pages');
    expect(rules).toContain('schema-no-controller');
    expect(rules).toContain('schema-no-repository');
    expect(rules).toContain('schema-no-express');
    expect(rules).toContain('validation-middleware-no-service');
    expect(rules).toContain('client-no-controller');
    expect(rules).toContain('mapper-no-database');
    expect(rules).toContain('removed-model-no-runtime');
    expect(rules).toContain('reconciliation-no-controller');
    expect(rules).toContain('schema-no-service');
    expect(rules).toContain('audit-write-via-adapter');
  });
});
