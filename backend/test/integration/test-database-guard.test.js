import { describe, expect, it } from 'vitest';
import { validateTestDatabaseUrl } from '../helpers/test-database.js';

describe('proteção do banco de testes', () => {
  it('aceita somente URL MySQL com nome explicitamente de teste', () => {
    expect(
      validateTestDatabaseUrl(
        'mysql://usuario:senha@localhost:3306/traceflow_test',
        'mysql://usuario:senha@localhost:3306/traceflow'
      )
    ).toContain('traceflow_test');
  });

  it.each([
    undefined,
    'not-a-url',
    'postgresql://usuario:senha@localhost/traceflow_test',
    'mysql://usuario:senha@localhost:3306/traceflow',
    'mysql://usuario:senha@localhost:3306/traceflow_production'
  ])('rejeita destino inseguro: %s', (unsafeUrl) => {
    expect(() =>
      validateTestDatabaseUrl(
        unsafeUrl,
        'mysql://usuario:senha@localhost:3306/traceflow'
      )
    ).toThrow();
  });

  it('rejeita a mesma URL usada pelo banco de desenvolvimento', () => {
    const sameUrl = 'mysql://usuario:senha@localhost:3306/traceflow_test';

    expect(() => validateTestDatabaseUrl(sameUrl, sameUrl)).toThrow(
      'deve ser diferente de DATABASE_URL'
    );
  });
});
