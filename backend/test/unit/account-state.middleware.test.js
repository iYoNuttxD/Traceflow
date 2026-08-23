import { describe, expect, it, vi } from 'vitest';
import { requireAccountState } from '../../src/middlewares/auth/account-state.middleware.js';

function execute(status, method, path) {
  const next = vi.fn();
  requireAccountState({ auth: { user: { accountStatus: status } }, method, path }, {}, next);
  return next.mock.calls[0][0];
}

describe('política de estado da conta L2', () => {
  it('permite acesso integral somente para conta ativa', () => {
    expect(execute('ACTIVE', 'POST', '/projects')).toBeUndefined();
    expect(execute('DEACTIVATED', 'POST', '/projects')).toMatchObject({
      code: 'ACCOUNT_DEACTIVATED',
      statusCode: 403
    });
  });

  it('limita conta desativada a consultar conta e solicitar reativação', () => {
    expect(execute('DEACTIVATED', 'GET', '/settings/account')).toBeUndefined();
    expect(execute('DEACTIVATED', 'POST', '/account/reactivation/start')).toBeUndefined();
  });

  it('permite exportar e cancelar durante exclusão pendente, mas bloqueia projetos', () => {
    expect(execute('DELETION_PENDING', 'POST', '/settings/privacy/export')).toBeUndefined();
    expect(execute('DELETION_PENDING', 'DELETE', '/settings/privacy/deletion')).toBeUndefined();
    expect(execute('DELETION_PENDING', 'GET', '/projects')).toMatchObject({
      code: 'ACCOUNT_DELETION_PENDING'
    });
  });
});
