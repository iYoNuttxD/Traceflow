import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CONNECTION_BUDGET,
  assertConnectionBudget,
  enforceConnectionBudget
} from '../../src/database/connection-budget.js';
import { withConnectionLimits } from '../../src/database/database-safety.js';
import { RECOVERY_POOL } from '../../src/database/recovery-prisma.js';

const backend = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const url = (query = '') => `mysql://ficticio:ficticio@db.invalid:3306/traceflow${query}`;
const production = (query, extra = {}) => ({
  NODE_ENV: 'production',
  DATABASE_URL: url(query),
  ...extra
});

describe('TF-REV-016 — uma fonte para o limite e teto por função', () => {
  it('os tetos são os do ADR-024 D2', () => {
    expect(CONNECTION_BUDGET).toEqual({ api: 5, worker: 3, command: 2 });
  });

  it('P-01 DATABASE_POOL_LIMIT presente recusa a partida, mesmo com a URL válida (A5)', () => {
    for (const value of ['100', '5', ''])
      expect(() =>
        assertConnectionBudget(
          'api',
          production('?connection_limit=5', { DATABASE_POOL_LIMIT: value })
        )
      ).toThrow(expect.objectContaining({ code: 'DATABASE_POOL_LIMIT_REMOVED' }));
  });

  it('P-02 produção sem connection_limit recusa a partida', () => {
    expect(() => assertConnectionBudget('api', production(''))).toThrow(
      expect.objectContaining({ code: 'CONNECTION_LIMIT_REQUIRED' })
    );
  });

  it.each([
    ['api', 5, 6],
    ['worker', 3, 4],
    ['command', 2, 3]
  ])('P-03 %s aceita %i e recusa %i', (role, allowed, refused) => {
    expect(assertConnectionBudget(role, production(`?connection_limit=${allowed}`))).toEqual({
      role,
      limit: allowed,
      ceiling: allowed
    });
    expect(() => assertConnectionBudget(role, production(`?connection_limit=${refused}`))).toThrow(
      expect.objectContaining({ code: 'CONNECTION_LIMIT_ABOVE_BUDGET' })
    );
  });

  it.each(['0', '-1', '2.5', 'abc'])('P-03 connection_limit=%s é inválido', (value) => {
    expect(() => assertConnectionBudget('api', production(`?connection_limit=${value}`))).toThrow(
      expect.objectContaining({ code: 'CONNECTION_LIMIT_INVALID' })
    );
  });

  it('P-04 desenvolvimento sem limite usa o pool padrão; com limite, respeita o teto', () => {
    const development = (query) => ({ NODE_ENV: 'development', DATABASE_URL: url(query) });
    expect(assertConnectionBudget('worker', development(''))).toEqual({
      role: 'worker',
      limit: null,
      ceiling: 3
    });
    expect(() => assertConnectionBudget('worker', development('?connection_limit=4'))).toThrow(
      expect.objectContaining({ code: 'CONNECTION_LIMIT_ABOVE_BUDGET' })
    );
  });

  it('P-04 em teste, vale a TEST_DATABASE_URL', () => {
    expect(
      assertConnectionBudget('command', {
        NODE_ENV: 'test',
        DATABASE_URL: url('?connection_limit=50'),
        TEST_DATABASE_URL: `${url('?connection_limit=2')}`.replace('traceflow', 'traceflow_test')
      })
    ).toMatchObject({ limit: 2 });
  });

  it('P-05 servidor, worker e os 4 comandos conferem o orçamento antes de qualquer consulta', () => {
    const entries = [
      ['src/server.js', 'api', 'app.listen('],
      ['src/github-worker.js', 'worker', 'runtime.start('],
      ['src/jobs/cli/notify-overdue-tasks.js', 'command', 'await run'],
      ['src/jobs/cli/dispatch-github-event-notifications.js', 'command', 'await run'],
      ['src/jobs/cli/reconcile-traceability-alerts.js', 'command', 'await run'],
      ['src/jobs/cli/notification-metrics.js', 'command', 'await run']
    ];
    for (const [file, role, firstWork] of entries) {
      const source = readFileSync(join(backend, file), 'utf8');
      const check = source.indexOf(`enforceConnectionBudget('${role}')`);
      expect(check, `${file} chama enforceConnectionBudget('${role}')`).toBeGreaterThan(-1);
      expect(check, `${file} confere antes de ${firstWork}`).toBeLessThan(
        source.indexOf(firstWork)
      );
    }
  });

  it('P-06 o cliente de recuperação continua com uma conexão, qualquer que seja a URL', () => {
    expect(RECOVERY_POOL).toEqual({ connectionLimit: 1, poolTimeoutSeconds: 2 });
    const recovery = new URL(withConnectionLimits(url('?connection_limit=5'), RECOVERY_POOL));
    expect(recovery.searchParams.get('connection_limit')).toBe('1');
    expect(recovery.searchParams.get('pool_timeout')).toBe('2');
  });

  describe('na partida', () => {
    let exit;
    let logger;
    beforeEach(() => {
      exit = vi.fn();
      logger = { error: vi.fn() };
    });
    afterEach(() => vi.unstubAllEnvs());

    it('recusa com código 1 e o código do erro no log, sem dado da URL', () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('DATABASE_URL', url('?connection_limit=9'));
      vi.stubEnv('DATABASE_POOL_LIMIT', undefined);

      expect(enforceConnectionBudget('worker', { logger, exit })).toBe(false);
      expect(exit).toHaveBeenCalledExactlyOnceWith(1);
      expect(logger.error).toHaveBeenCalledWith(expect.any(String), {
        event: 'connection_budget_invalid',
        role: 'worker',
        code: 'CONNECTION_LIMIT_ABOVE_BUDGET'
      });
      expect(JSON.stringify(logger.error.mock.calls)).not.toContain('ficticio');
    });

    it('aceita sem sair', () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('DATABASE_URL', url('?connection_limit=3'));
      vi.stubEnv('DATABASE_POOL_LIMIT', undefined);

      expect(enforceConnectionBudget('worker', { logger, exit })).toBe(true);
      expect(exit).not.toHaveBeenCalled();
    });
  });
});
