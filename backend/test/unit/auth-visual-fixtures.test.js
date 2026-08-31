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
  it('falha fechado em produção, sem opt-in e fora do banco local de teste', () => {
    expect(() =>
      validateAuthVisualFixtureEnvironment(safeEnvironment({ NODE_ENV: 'production' }))
    ).toThrow(/proibidas/);
    expect(() =>
      validateAuthVisualFixtureEnvironment(safeEnvironment({ AUTH_VISUAL_FIXTURES: undefined }))
    ).toThrow(/AUTH_VISUAL_FIXTURES=true/);
    expect(() =>
      validateAuthVisualFixtureEnvironment(
        safeEnvironment({
          TEST_DATABASE_URL: [
            'mysql://local:local',
            '@db.example.test/traceflow_auth_visual_test'
          ].join('')
        })
      )
    ).toThrow(/MySQL local/);
    expect(() =>
      validateAuthVisualFixtureEnvironment(
        safeEnvironment({ EMAIL_VERIFICATION_URL: 'https://example.test/verify-email' })
      )
    ).toThrow(/deve apontar/);
  });

  it('não aceita o schema de desenvolvimento com credenciais diferentes', () => {
    expect(() =>
      validateAuthVisualFixtureEnvironment(
        safeEnvironment({
          TEST_DATABASE_URL: 'mysql://user:password@localhost:3306/traceflow_development_test',
          DATABASE_URL: 'mysql://usuario:senha@localhost:3306/traceflow_development_test'
        })
      )
    ).toThrow(/schema diferente/);
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

  it('mantém um conjunto idempotente e remove somente relações das fixtures', async () => {
    const fixture = createFixtureClient();
    const first = await resetAuthVisualFixtureUsers({
      client: fixture.client,
      passwordHash: 'first-hash'
    });
    const firstIds = Object.fromEntries(Object.entries(first).map(([key, user]) => [key, user.id]));
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
      Object.entries(second).map(([key, user]) => [key, user.id])
    );

    expect(fixture.users.size).toBe(AUTH_VISUAL_FIXTURE_USERS.length);
    expect(secondIds).toEqual(firstIds);
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
