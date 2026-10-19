import { logger as defaultLogger } from '../shared/logger/index.js';
import { parseDatabaseUrl } from './database-safety.js';

export const CONNECTION_BUDGET = Object.freeze({ api: 5, worker: 3, command: 2 });

export class ConnectionBudgetError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ConnectionBudgetError';
    this.code = code;
  }
}

function connectionLimitOf(databaseUrl) {
  const raw = parseDatabaseUrl(databaseUrl).searchParams.get('connection_limit');
  if (raw === null) return null;
  const limit = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(limit) || limit < 1)
    throw new ConnectionBudgetError(
      'CONNECTION_LIMIT_INVALID',
      'O connection_limit da DATABASE_URL deve ser um inteiro positivo.'
    );
  return limit;
}

export function assertConnectionBudget(role, environment = process.env) {
  const ceiling = CONNECTION_BUDGET[role];
  if (!ceiling) throw new TypeError(`Função de processo desconhecida: ${role}.`);
  if (environment.DATABASE_POOL_LIMIT !== undefined)
    throw new ConnectionBudgetError(
      'DATABASE_POOL_LIMIT_REMOVED',
      'DATABASE_POOL_LIMIT não existe mais: use connection_limit na DATABASE_URL (ADR-024 D2).'
    );
  const databaseUrl =
    environment.NODE_ENV === 'test' ? environment.TEST_DATABASE_URL : environment.DATABASE_URL;
  const limit = connectionLimitOf(databaseUrl);
  if (limit === null) {
    if (environment.NODE_ENV === 'production')
      throw new ConnectionBudgetError(
        'CONNECTION_LIMIT_REQUIRED',
        `Em produção, a DATABASE_URL precisa de connection_limit de no máximo ${ceiling} (${role}).`
      );
    return { role, limit: null, ceiling };
  }
  if (limit > ceiling)
    throw new ConnectionBudgetError(
      'CONNECTION_LIMIT_ABOVE_BUDGET',
      `O connection_limit ${limit} passa do teto de ${ceiling} conexões para ${role} (ADR-024 D2).`
    );
  return { role, limit, ceiling };
}

export function enforceConnectionBudget(
  role,
  { logger = defaultLogger, exit = (code) => process.exit(code) } = {}
) {
  try {
    assertConnectionBudget(role);
    return true;
  } catch (error) {
    logger.error('A configuração de conexões do banco é inválida; o processo não sobe.', {
      event: 'connection_budget_invalid',
      role,
      code: error?.code ?? 'CONNECTION_BUDGET_INVALID'
    });
    exit(1);
    return false;
  }
}
