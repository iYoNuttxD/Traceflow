import { describe, expect, it } from 'vitest';
import {
  AUTH_VISUAL_FIXTURE_USERS,
  extractLocalFixtureUrl,
  resetAuthVisualFixtureUsers,
  validateAuthVisualFixtureEnvironment
} from '../../scripts/lib/auth-visual-fixtures.js';

function safeEnvironment(overrides = {}) {
  return {
    NODE_ENV: 'test',
    AUTH_VISUAL_FIXTURES: 'true',
    EMAIL_PROVIDER: 'capture',
    DATABASE_URL: 'mysql://usuario:senha@localhost:3306/traceflow_development',
    TEST_DATABASE_URL: 'mysql://usuario:senha@localhost:3306/traceflow_auth_visual_test',
    FRONTEND_URL: 'http://localhost:5173',
    AUTH_VISUAL_FIXTURE_PASSWORD: 'fixture-only-password-value',
    ...overrides
  };
}

function createFixtureClient() {
  const users = new Map();
  const deletions = [];
  let nextId = 1;
  const deletingModel = (model) => ({
    async deleteMany(input) {
      deletions.push({ model, input });
      return { count: 0 };
    }
  });
  const tx = {
    project: {
      async findMany() {
        return [];
      },
      async deleteMany(input) {
        deletions.push({ model: 'project', input });
        return { count: 0 };
      }
    },
    user: {
      async findMany({ where }) {
        return [...users.values()]
          .filter(
            (user) =>
              where.OR[0].username.in.includes(user.username) ||
              where.OR[1].email.in.includes(user.email)
          )
          .map(({ id, username, email }) => ({ id, username, email }));
      },
      async create({ data }) {
        const user = { id: nextId++, ...data };
        users.set(user.username, user);
        return user;
      },
      async update({ where, data }) {
        const current = [...users.values()].find((user) => user.id === where.id);
        users.delete(current.username);
        const user = { ...current, ...data };
        users.set(user.username, user);
        return user;
      }
    },
    session: deletingModel('session'),
    passwordResetToken: deletingModel('passwordResetToken'),
    emailVerificationToken: deletingModel('emailVerificationToken'),
    emailChangeRequest: deletingModel('emailChangeRequest'),
    accountReactivationToken: deletingModel('accountReactivationToken'),
    personalDataExport: deletingModel('personalDataExport'),
    privacyRequest: deletingModel('privacyRequest'),
    auditEvent: deletingModel('auditEvent')
  };
  return {
    users,
    deletions,
    client: { $transaction: (operation) => operation(tx) }
  };
}

describe('fixtures visuais de Auth', () => {
  it.each([
    ['produção', { NODE_ENV: 'production' }, /proibidas/],
    ['ambiente diferente de test', { NODE_ENV: 'development' }, /NODE_ENV=test/],
    ['opt-in ausente', { AUTH_VISUAL_FIXTURES: 'false' }, /AUTH_VISUAL_FIXTURES=true/],
    ['provider externo', { EMAIL_PROVIDER: 'smtp' }, /EMAIL_PROVIDER=capture/],
    ['URL de teste ausente', { TEST_DATABASE_URL: undefined }, /obrigatória/],
    ['URL de teste inválida', { TEST_DATABASE_URL: 'not-a-url' }, /URL válida/],
    [
      'protocolo não MySQL',
      { TEST_DATABASE_URL: 'postgresql://local:local@localhost/traceflow_auth_visual_test' },
      /usar MySQL/
    ],
    [
      'schema sem marcador test',
      { TEST_DATABASE_URL: 'mysql://local:local@localhost/traceflow_visual' },
      /banco de teste/
    ],
    [
      'schema de produção',
      { TEST_DATABASE_URL: 'mysql://local:local@localhost/traceflow_production_test' },
      /banco de produção/
    ],
    [
      'banco remoto',
      { TEST_DATABASE_URL: 'mysql://local:local@db.example.test/traceflow_auth_visual_test' },
      /MySQL local/
    ],
    ['DATABASE_URL inválida', { DATABASE_URL: 'not-a-url' }, /DATABASE_URL não é uma URL válida/],
    ['senha curta', { AUTH_VISUAL_FIXTURE_PASSWORD: 'short' }, /ao menos 16 caracteres/],
    ['frontend externo', { FRONTEND_URL: 'https://example.test' }, /deve apontar/]
  ])('falha fechado para %s', (_name, overrides, message) => {
    expect(() => validateAuthVisualFixtureEnvironment(safeEnvironment(overrides))).toThrow(message);
  });

  it.each([
    ['EMAIL_VERIFICATION_URL', 'verify-email'],
    ['EMAIL_CHANGE_CONFIRM_URL', 'settings/account/email-change/confirm'],
    ['ACCOUNT_REACTIVATION_URL', 'account/reactivation/confirm']
  ])('rejeita %s externa', (variable, path) => {
    expect(() =>
      validateAuthVisualFixtureEnvironment(
        safeEnvironment({ [variable]: `https://example.test/${path}` })
      )
    ).toThrow(new RegExp(variable));
  });

  it.each([
    ['EMAIL_VERIFICATION_URL', 'verify-email'],
    ['EMAIL_CHANGE_CONFIRM_URL', 'settings/account/email-change/confirm'],
    ['ACCOUNT_REACTIVATION_URL', 'account/reactivation/confirm']
  ])('rejeita origem local divergente em %s', (variable, path) => {
    expect(() =>
      validateAuthVisualFixtureEnvironment(
        safeEnvironment({ [variable]: `http://127.0.0.1:5174/${path}` })
      )
    ).toThrow(/mesma origem local/);
  });

  it.each([
    ['localhost', 'localhost'],
    ['localhost', '127.0.0.1'],
    ['localhost', '[::1]'],
    ['127.0.0.1', '[::1]']
  ])('rejeita o mesmo alvo entre aliases %s e %s', (developmentHost, testHost) => {
    expect(() =>
      validateAuthVisualFixtureEnvironment(
        safeEnvironment({
          DATABASE_URL: `mysql://dev:dev@${developmentHost}:3306/TraceFlow_Auth_Test`,
          TEST_DATABASE_URL: `mysql://test:test@${testHost}:3306/traceflow_auth_test`
        })
      )
    ).toThrow(/diferente de DATABASE_URL/);
  });

  it('compara schemas conservadoramente sem expor credenciais', () => {
    let failure;
    try {
      validateAuthVisualFixtureEnvironment(
        safeEnvironment({
          DATABASE_URL: 'mysql://dev:development-secret@localhost/TraceFlow_Auth_Test',
          TEST_DATABASE_URL: 'mysql://test:fixture-secret@127.0.0.1/traceflow_auth_test'
        })
      );
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect(failure.message).toMatch(/diferente de DATABASE_URL/);
    expect(failure.message).not.toMatch(/development-secret|fixture-secret/);
  });

  it.each(['localhost.evil.com', '127.0.0.1.example.com', '0.0.0.0', '127.0.0.2'])(
    'não amplia a allowlist local para %s',
    (hostname) => {
      expect(() =>
        validateAuthVisualFixtureEnvironment(
          safeEnvironment({
            TEST_DATABASE_URL: `mysql://local:local@${hostname}/traceflow_auth_visual_test`
          })
        )
      ).toThrow(/MySQL local/);
    }
  );

  it('rejeita host percent-encoded sem tratá-lo como alias local', () => {
    expect(() =>
      validateAuthVisualFixtureEnvironment(
        safeEnvironment({
          TEST_DATABASE_URL: 'mysql://local:local@localhost%2eevil.com/traceflow_auth_visual_test'
        })
      )
    ).toThrow(/MySQL local/);
  });

  it('aceita somente configuração local explícita e retorna destino sanitizado', () => {
    expect(validateAuthVisualFixtureEnvironment(safeEnvironment())).toMatchObject({
      frontendUrl: 'http://localhost:5173',
      target: {
        host: 'localhost',
        port: '3306',
        database: 'traceflow_auth_visual_test'
      }
    });
  });

  it('aceita a representação IPv6 realmente produzida por URL', () => {
    const parsedHostname = new URL('mysql://local:local@[::1]/traceflow_auth_visual_test').hostname;
    expect(parsedHostname).toBe('[::1]');
    expect(
      validateAuthVisualFixtureEnvironment(
        safeEnvironment({
          TEST_DATABASE_URL: 'mysql://local:local@[::1]/traceflow_auth_visual_test',
          FRONTEND_URL: 'http://[::1]:5173'
        })
      )
    ).toMatchObject({
      frontendUrl: 'http://[::1]:5173',
      target: { host: '[::1]', port: '3306', database: 'traceflow_auth_visual_test' }
    });
  });

  it('mantém schemas diferentes como alvos distintos no mesmo host local', () => {
    expect(
      validateAuthVisualFixtureEnvironment(
        safeEnvironment({
          DATABASE_URL: 'mysql://dev:dev@localhost/traceflow_development',
          TEST_DATABASE_URL: 'mysql://test:test@127.0.0.1/traceflow_auth_visual_test'
        })
      ).target.database
    ).toBe('traceflow_auth_visual_test');
  });

  it('considera a porta MySQL default equivalente a 3306 explícita', () => {
    expect(() =>
      validateAuthVisualFixtureEnvironment(
        safeEnvironment({
          DATABASE_URL: 'mysql://dev:dev@localhost/traceflow_auth_visual_test',
          TEST_DATABASE_URL: 'mysql://test:test@127.0.0.1:3306/traceflow_auth_visual_test'
        })
      )
    ).toThrow(/diferente de DATABASE_URL/);
  });

  it('mantém um conjunto idempotente e remove somente relações das fixtures', async () => {
    const fixture = createFixtureClient();
    const first = await resetAuthVisualFixtureUsers({
      client: fixture.client,
      passwordHash: 'first-hash'
    });
    const firstIds = Object.fromEntries(
      Object.entries(first.users).map(([key, user]) => [key, user.id])
    );
    const pendingUsername = fixture.users.get('visual_auth_username_pending');
    fixture.users.delete(pendingUsername.username);
    fixture.users.set('username_changed_during_review', {
      ...pendingUsername,
      username: 'username_changed_during_review'
    });

    const second = await resetAuthVisualFixtureUsers({
      client: fixture.client,
      passwordHash: 'second-hash'
    });
    const secondIds = Object.fromEntries(
      Object.entries(second.users).map(([key, user]) => [key, user.id])
    );

    expect(fixture.users.size).toBe(AUTH_VISUAL_FIXTURE_USERS.length);
    expect(secondIds).toEqual(firstIds);
    expect(second.cleanup).toEqual({ projectsRemoved: 0 });
    expect([...fixture.users.values()].every((user) => user.passwordHash === 'second-hash')).toBe(
      true
    );
    expect(fixture.deletions.length).toBeGreaterThan(0);
    expect(fixture.deletions.every(({ input }) => input?.where)).toBe(true);
    expect(
      fixture.deletions.every(({ model, input }) =>
        model === 'auditEvent'
          ? input.where.actorUserId.in.length === AUTH_VISUAL_FIXTURE_USERS.length
          : input.where.userId.in.length === AUTH_VISUAL_FIXTURE_USERS.length
      )
    ).toBe(true);
  });

  it('aceita somente token capturado no frontend local', () => {
    expect(
      extractLocalFixtureUrl(
        { text: 'Confirme em: http://localhost:5173/verify-email?token=local-token\nExpira.' },
        'http://localhost:5173'
      )
    ).toBe('http://localhost:5173/verify-email?token=local-token');
    expect(() =>
      extractLocalFixtureUrl(
        { text: 'Confirme em: https://example.test/verify-email?token=external-token' },
        'http://localhost:5173'
      )
    ).toThrow(/não pertence/);
  });
});
