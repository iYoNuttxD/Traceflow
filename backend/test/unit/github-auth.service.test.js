import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  repository: {
    createOAuthState: vi.fn(),
    findOAuthState: vi.fn(),
    consumeOAuthState: vi.fn(),
    findIdentityByGithubUserId: vi.fn(),
    findIdentityByUserId: vi.fn(),
    findUserByEmail: vi.fn(),
    findUserByUsername: vi.fn(),
    createGithubAccount: vi.fn(),
    refreshIdentity: vi.fn(),
    linkIdentity: vi.fn(),
    markSessionReauthenticated: vi.fn(),
    isUniqueViolation: vi.fn()
  },
  provider: {
    exchangeLoginUserCode: vi.fn(),
    getAuthenticatedUser: vi.fn(),
    getPrimaryVerifiedEmail: vi.fn()
  },
  auth: {
    publicUser: vi.fn((user) => ({
      id: user.id,
      email: user.email,
      username: user.username,
      accountStatus: user.accountStatus,
      hasLocalPassword: Boolean(user.passwordHash)
    })),
    issueSession: vi.fn(),
    verifyPassword: vi.fn()
  },
  logger: { warn: vi.fn() }
}));

vi.mock('../../src/config/env.js', () => ({
  env: {
    githubAppConfigured: true,
    githubAppClientId: 'Iv1.artificial',
    githubLoginCallbackUrl: 'https://api.traceflow.test/api/auth/github/callback',
    githubOAuthStateTtlMs: 600000
  }
}));
vi.mock('../../src/modules/auth/github-auth.repository.js', () => ({
  githubAuthRepository: mocks.repository
}));
vi.mock('../../src/modules/github/github-credential.provider.js', () => ({
  githubAppCredentialProvider: mocks.provider
}));
vi.mock('../../src/modules/auth/auth.service.js', () => ({ authService: mocks.auth }));
vi.mock('../../src/shared/logger/index.js', () => ({ logger: mocks.logger }));

const { githubAuthService, sanitizeInternalReturnTo } =
  await import('../../src/modules/auth/github-auth.service.js');

function callbackState(start, overrides = {}) {
  const [state] = start.browserCookie.split('.');
  return {
    input: { code: 'oauth-code', state, browserCookie: start.browserCookie },
    record: {
      id: 10,
      purpose: 'LOGIN',
      userId: null,
      sessionId: null,
      rememberMe: false,
      returnTo: '/projects',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60000),
      user: null,
      session: null,
      ...overrides
    }
  };
}

describe('autenticação GitHub L1.1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.repository.createOAuthState.mockResolvedValue({ id: 10 });
    mocks.repository.consumeOAuthState.mockResolvedValue({ count: 1 });
    mocks.repository.findUserByEmail.mockResolvedValue(null);
    mocks.repository.findUserByUsername.mockResolvedValue(null);
    mocks.repository.findIdentityByGithubUserId.mockResolvedValue(null);
    mocks.repository.findIdentityByUserId.mockResolvedValue(null);
    mocks.repository.isUniqueViolation.mockReturnValue(false);
    mocks.provider.exchangeLoginUserCode.mockResolvedValue('token-efemero');
    mocks.provider.getAuthenticatedUser.mockResolvedValue({ id: 123, login: 'octocat' });
    mocks.provider.getPrimaryVerifiedEmail.mockResolvedValue('octocat@example.test');
    mocks.auth.issueSession.mockResolvedValue({
      token: 'sessao',
      csrfToken: 'csrf',
      ttlMs: 1000
    });
    mocks.auth.verifyPassword.mockResolvedValue(true);
  });

  it('gera state por hash, PKCE S256, callback fixo e cookie transitório sem persistir verifier', async () => {
    const result = await githubAuthService.startLogin({
      rememberMe: true,
      returnTo: '/invitations/accept?token=ABC#confirmar'
    });
    const url = new URL(result.url);
    const [state, verifier] = result.browserCookie.split('.');
    expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://api.traceflow.test/api/auth/github/callback'
    );
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBe(
      createHash('sha256').update(verifier).digest('base64url')
    );
    expect(state).toHaveLength(43);
    expect(mocks.repository.createOAuthState).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenHash: createHash('sha256').update(state).digest('hex'),
        purpose: 'LOGIN',
        rememberMe: true,
        returnTo: '/invitations/accept?token=ABC#confirmar'
      })
    );
    expect(JSON.stringify(mocks.repository.createOAuthState.mock.calls)).not.toContain(verifier);
  });

  it.each([
    ['https://evil.example', '/projects'],
    ['//evil.example', '/projects'],
    ['javascript:alert(1)', '/projects'],
    ['\\evil', '/projects'],
    ['/projects/10?tab=a#b', '/projects/10?tab=a#b']
  ])('sanitiza returnTo %s', (value, expected) => {
    expect(sanitizeInternalReturnTo(value)).toBe(expected);
  });

  it('autentica identidade existente pelo githubUserId sem consultar e-mail e atualiza só metadata externa', async () => {
    const start = await githubAuthService.startLogin({ rememberMe: true, returnTo: '/projects/7' });
    const state = callbackState(start, { rememberMe: true, returnTo: '/projects/7' });
    const linkedUser = {
      id: 7,
      email: 'traceflow-a@example.test',
      username: 'traceflow-user',
      passwordHash: 'hash',
      accountStatus: 'ACTIVE',
      sessionVersion: 3
    };
    mocks.repository.findOAuthState.mockResolvedValue(state.record);
    mocks.repository.findIdentityByGithubUserId.mockResolvedValue({
      id: 20,
      githubUserId: '123',
      githubLogin: 'old-name',
      user: linkedUser
    });
    mocks.provider.getAuthenticatedUser.mockResolvedValue({
      id: 123,
      login: 'new-name',
      email: 'github-b@example.test'
    });
    mocks.repository.refreshIdentity.mockResolvedValue({
      id: 20,
      githubLogin: 'new-name',
      user: linkedUser
    });

    const result = await githubAuthService.completeCallback(state.input);

    expect(result.user).toMatchObject({ id: 7, email: 'traceflow-a@example.test' });
    expect(result.returnTo).toBe('/projects/7');
    expect(mocks.provider.getPrimaryVerifiedEmail).not.toHaveBeenCalled();
    expect(mocks.repository.refreshIdentity).toHaveBeenCalledWith(20, 'new-name', expect.any(Date));
    expect(mocks.auth.issueSession).toHaveBeenCalledWith(
      linkedUser,
      true,
      expect.objectContaining({ lastReauthenticatedAt: expect.any(Date) })
    );
  });

  it('bloqueia takeover quando o e-mail verificado já pertence a User sem identidade', async () => {
    const start = await githubAuthService.startLogin({ rememberMe: false });
    const state = callbackState(start);
    mocks.repository.findOAuthState.mockResolvedValue(state.record);
    mocks.repository.findUserByEmail.mockResolvedValue({ id: 99 });

    await expect(githubAuthService.completeCallback(state.input)).rejects.toMatchObject({
      code: 'GITHUB_EMAIL_ACCOUNT_CONFLICT',
      statusCode: 409
    });
    expect(mocks.repository.createGithubAccount).not.toHaveBeenCalled();
    expect(mocks.auth.issueSession).not.toHaveBeenCalled();
  });

  it('cria User e GitHubIdentity juntos com e-mail verificado, sem senha e username temporário seguro', async () => {
    const start = await githubAuthService.startLogin({ rememberMe: false });
    const state = callbackState(start);
    mocks.repository.findOAuthState.mockResolvedValue(state.record);
    mocks.provider.getAuthenticatedUser.mockResolvedValue({ id: 456, login: 'github', name: '' });
    const createdUser = {
      id: 40,
      name: 'github',
      email: 'octocat@example.test',
      username: 'github-a1b2c3d4',
      passwordHash: null,
      accountStatus: 'ACTIVE',
      sessionVersion: 1
    };
    mocks.repository.createGithubAccount.mockResolvedValue({
      user: createdUser,
      identity: { id: 50, githubUserId: '456', githubLogin: 'github' }
    });

    const result = await githubAuthService.completeCallback(state.input);

    expect(result).toMatchObject({
      accountCreated: true,
      user: { id: 40, hasLocalPassword: false }
    });
    expect(mocks.repository.createGithubAccount).toHaveBeenCalledWith({
      user: expect.objectContaining({
        email: 'octocat@example.test',
        emailVerifiedAt: expect.any(Date),
        passwordHash: null,
        mustSetUsername: true
      }),
      identity: expect.objectContaining({ githubUserId: '456', githubLogin: 'github' })
    });
    const username = mocks.repository.createGithubAccount.mock.calls[0][0].user.username;
    expect(username).toMatch(/^github-[a-f0-9]{8}$/);
    expect(username).not.toContain('456');
  });

  it('exige e-mail principal verificado para criar conta', async () => {
    const start = await githubAuthService.startLogin({});
    const state = callbackState(start);
    mocks.repository.findOAuthState.mockResolvedValue(state.record);
    mocks.provider.getPrimaryVerifiedEmail.mockResolvedValue(undefined);
    await expect(githubAuthService.completeCallback(state.input)).rejects.toMatchObject({
      code: 'GITHUB_VERIFIED_EMAIL_REQUIRED'
    });
  });

  it('reautentica somente quando o GitHub ID corresponde à identidade da sessão', async () => {
    const started = await githubAuthService.startLogin({});
    const state = callbackState(started, {
      purpose: 'REAUTH_SET_PASSWORD',
      userId: 7,
      sessionId: 8,
      user: { id: 7, accountStatus: 'ACTIVE', sessionVersion: 2 },
      session: {
        id: 8,
        userId: 7,
        sessionVersion: 2,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60000)
      }
    });
    mocks.repository.findOAuthState.mockResolvedValue(state.record);
    mocks.repository.findIdentityByUserId.mockResolvedValue({ githubUserId: '999' });
    await expect(githubAuthService.completeCallback(state.input)).rejects.toMatchObject({
      code: 'GITHUB_IDENTITY_MISMATCH'
    });
    expect(mocks.repository.markSessionReauthenticated).not.toHaveBeenCalled();
  });
});
