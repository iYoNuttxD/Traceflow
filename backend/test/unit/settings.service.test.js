import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  repository: {
    account: vi.fn(),
    pendingEmailChange: vi.fn(),
    updateProfile: vi.fn(),
    updateUsername: vi.fn(),
    findUserByEmail: vi.fn(),
    createEmailChange: vi.fn(),
    cancelEmailChange: vi.fn(),
    confirmEmailChange: vi.fn(),
    changePassword: vi.fn(),
    initializePassword: vi.fn(),
    unlinkGithubIdentity: vi.fn(),
    listSessions: vi.fn(),
    revokeSession: vi.fn(),
    revokeOtherSessions: vi.fn(),
    deactivate: vi.fn(),
    createReactivationToken: vi.fn(),
    confirmReactivation: vi.fn(),
    pendingDeletion: vi.fn(),
    requestDeletion: vi.fn(),
    cancelDeletion: vi.fn(),
    exportData: vi.fn(),
    exportGithubAuthoredCommits: vi.fn(),
    recordExport: vi.fn(),
    listGithubAuthorizations: vi.fn(),
    removeGithubAuthorization: vi.fn()
  },
  auth: { verifyPassword: vi.fn(), hashPassword: vi.fn() },
  email: {
    sendEmailChangeConfirmation: vi.fn(),
    sendEmailChangedNotice: vi.fn(),
    sendPasswordChangedNotice: vi.fn(),
    sendAccountDeactivatedNotice: vi.fn(),
    sendAccountReactivation: vi.fn(),
    sendAccountDeletionRequested: vi.fn(),
    sendAccountDeletionCancelled: vi.fn()
  },
  github: { listRepositories: vi.fn() },
  githubAuth: { identity: vi.fn(), startLink: vi.fn() }
}));

vi.mock('../../src/config/env.js', () => ({
  env: {
    emailChangeTtlMs: 1_800_000,
    accountReactivationTtlMs: 1_800_000,
    accountDeletionGraceDays: 30,
    exportFileTtlMinutes: 15,
    auditRetentionDays: 365,
    githubReauthenticationTtlMs: 600000
  }
}));
vi.mock('../../src/modules/settings/settings.repository.js', () => ({
  settingsRepository: mocks.repository
}));
vi.mock('../../src/modules/auth/auth.service.js', () => ({ authService: mocks.auth }));
vi.mock('../../src/shared/email/index.js', () => ({ emailService: mocks.email }));
vi.mock('../../src/modules/github/github-app.service.js', () => ({
  githubAppService: mocks.github
}));
vi.mock('../../src/modules/auth/github-auth.service.js', () => ({
  githubAuthService: mocks.githubAuth
}));

const { settingsService } = await import('../../src/modules/settings/settings.service.js');

const activeUser = {
  id: 7,
  name: 'Daniel Silva',
  username: 'daniel',
  email: 'daniel@example.test',
  accountStatus: 'ACTIVE',
  mustSetUsername: false,
  usernameChangedAt: null,
  passwordHash: 'argon2-current'
};

describe('configurações de conta L2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.repository.account.mockResolvedValue(activeUser);
    mocks.repository.pendingEmailChange.mockResolvedValue(null);
    mocks.repository.findUserByEmail.mockResolvedValue(null);
    mocks.repository.exportGithubAuthoredCommits.mockResolvedValue([]);
    mocks.auth.verifyPassword.mockResolvedValue(true);
    mocks.auth.hashPassword.mockResolvedValue('argon2-hash');
    mocks.githubAuth.identity.mockResolvedValue(null);
    for (const method of Object.values(mocks.email))
      method.mockResolvedValue({ status: 'accepted' });
  });

  it('altera somente o nome no perfil e audita a operação', async () => {
    mocks.repository.updateProfile.mockResolvedValue({ ...activeUser, name: 'Novo Nome' });
    await settingsService.updateProfile(7, ' Novo Nome ', 'req-1');
    expect(mocks.repository.updateProfile).toHaveBeenCalledWith(
      7,
      'Novo Nome',
      expect.objectContaining({ action: 'PROFILE_UPDATED', actorUserId: 7 })
    );
    expect(mocks.repository.findUserByEmail).not.toHaveBeenCalled();
  });

  it('aplica cooldown de 30 dias ao username sem bloquear o cadastro legado obrigatório', async () => {
    mocks.repository.account.mockResolvedValue({
      ...activeUser,
      usernameChangedAt: new Date('2030-01-15T00:00:00Z')
    });
    await expect(
      settingsService.updateUsername(7, 'novo-user', 'req-2', new Date('2030-01-20T00:00:00Z'))
    ).rejects.toMatchObject({ code: 'USERNAME_CHANGE_COOLDOWN' });

    expect(mocks.repository.updateUsername).not.toHaveBeenCalled();
    await expect(
      settingsService.updateUsername(
        7,
        'novo-user',
        'req-boundary',
        new Date('2030-02-13T23:59:59.999Z')
      )
    ).rejects.toMatchObject({ code: 'USERNAME_CHANGE_COOLDOWN' });
    expect(mocks.repository.updateUsername).not.toHaveBeenCalled();
    mocks.repository.updateUsername.mockResolvedValue({ ...activeUser, username: 'novo-user' });
    await expect(
      settingsService.updateUsername(
        7,
        'novo-user',
        'req-boundary',
        new Date('2030-02-14T00:00:00Z')
      )
    ).resolves.toMatchObject({ username: 'novo-user' });
    mocks.repository.account.mockResolvedValue({
      ...activeUser,
      mustSetUsername: true,
      usernameChangedAt: new Date('2030-01-15T00:00:00Z')
    });
    mocks.repository.updateUsername.mockResolvedValue({ ...activeUser, username: 'novo-user' });
    await expect(
      settingsService.updateUsername(7, 'novo-user', 'req-2', new Date('2030-01-20T00:00:00Z'))
    ).resolves.toMatchObject({ username: 'novo-user' });
  });

  it('mantém o e-mail atual até confirmação e persiste apenas hash do token', async () => {
    mocks.repository.createEmailChange.mockResolvedValue({
      id: 11,
      newEmail: 'novo@example.test',
      expiresAt: new Date('2030-01-01T00:30:00Z')
    });
    await settingsService.requestEmailChange(
      7,
      { id: 22, lastReauthenticatedAt: null },
      { newEmail: 'novo@example.test', currentPassword: 'senha-segura' },
      'req-3',
      new Date('2030-01-01T00:00:00Z')
    );
    const persisted = mocks.repository.createEmailChange.mock.calls[0][1];
    const delivered = mocks.email.sendEmailChangeConfirmation.mock.calls[0][0];
    expect(persisted).toMatchObject({
      currentEmailSnapshot: activeUser.email,
      newEmail: 'novo@example.test'
    });
    expect(persisted.tokenHash).toBe(createHash('sha256').update(delivered.token).digest('hex'));
    expect(persisted.expiresAt).toEqual(new Date('2030-01-01T00:30:00Z'));
    expect(delivered).toMatchObject({
      to: 'novo@example.test',
      expiresAt: new Date('2030-01-01T00:30:00Z')
    });
    expect(delivered.token).not.toBe(persisted.tokenHash);
    expect(JSON.stringify(mocks.repository.createEmailChange.mock.calls)).not.toContain(
      delivered.token
    );
  });

  it('preserva a sessão atual ao trocar senha e revoga as demais pelo repository', async () => {
    await settingsService.changePassword(
      7,
      22,
      {
        currentPassword: 'Senha-Antiga-123!',
        newPassword: 'Senha-Nova-456!',
        confirmation: 'Senha-Nova-456!'
      },
      'req-4'
    );
    expect(mocks.repository.changePassword).toHaveBeenCalledWith(
      7,
      22,
      'argon2-hash',
      expect.any(Date),
      expect.objectContaining({ action: 'PASSWORD_CHANGED' })
    );
  });

  it('expõe somente hasLocalPassword e autorização recente calculada', async () => {
    mocks.repository.account.mockResolvedValue({ ...activeUser, passwordHash: null });
    const recent = new Date();
    mocks.githubAuth.identity.mockResolvedValue({
      githubLogin: 'daniel',
      lastAuthenticatedAt: recent
    });
    const account = await settingsService.account(7, { lastReauthenticatedAt: recent });
    expect(account).toMatchObject({
      hasLocalPassword: false,
      hasGithubIdentity: true,
      recentlyReauthenticated: true,
      canInitializePassword: true
    });
    expect(account).not.toHaveProperty('passwordHash');
  });

  it('inicializa a primeira senha em operação dedicada e consome a reautenticação na transação', async () => {
    mocks.repository.account.mockResolvedValue({ ...activeUser, passwordHash: null });
    mocks.repository.initializePassword.mockResolvedValue({ status: 'initialized' });
    await settingsService.initializePassword(
      7,
      22,
      { newPassword: 'Senha-Nova-456!', confirmation: 'Senha-Nova-456!' },
      'req-password',
      new Date('2030-01-01T00:10:00Z')
    );
    expect(mocks.repository.initializePassword).toHaveBeenCalledWith(
      7,
      22,
      'argon2-hash',
      new Date('2030-01-01T00:00:00Z'),
      new Date('2030-01-01T00:10:00Z'),
      expect.objectContaining({ action: 'LOCAL_PASSWORD_INITIALIZED' })
    );
  });

  it('impede desvincular a única identidade sem senha local', async () => {
    mocks.repository.account.mockResolvedValue({ ...activeUser, passwordHash: null });
    await expect(
      settingsService.unlinkGithubIdentity(
        7,
        22,
        { currentPassword: 'qualquer', confirmation: true },
        'req-unlink'
      )
    ).rejects.toMatchObject({ code: 'LOCAL_PASSWORD_REQUIRED' });
    expect(mocks.repository.unlinkGithubIdentity).not.toHaveBeenCalled();
  });

  it('lista apenas identificadores públicos de sessão', async () => {
    mocks.repository.listSessions.mockResolvedValue([
      {
        id: 991,
        tokenHash: 'private-session-sentinel',
        publicId: 'b6360643-0216-4cb7-873b-4e851250f524',
        rememberMe: false,
        createdAt: new Date(),
        lastSeenAt: new Date(),
        expiresAt: new Date(),
        revokedAt: null
      }
    ]);
    mocks.repository.listSessions.mockResolvedValue([
      ...(await mocks.repository.listSessions()),
      { publicId: 'b6360643-0216-4cb7-873b-4e851250f525', id: 992, tokenHash: 'second-secret' }
    ]);
    const sessions = await settingsService.sessions(7, 'b6360643-0216-4cb7-873b-4e851250f524');
    expect(sessions[0]).toMatchObject({ current: true, sessionId: expect.any(String) });
    expect(sessions.map(({ sessionId, current }) => ({ sessionId, current }))).toEqual([
      { sessionId: 'b6360643-0216-4cb7-873b-4e851250f524', current: true },
      { sessionId: 'b6360643-0216-4cb7-873b-4e851250f525', current: false }
    ]);
    expect(JSON.stringify(sessions)).not.toMatch(
      /private-session-sentinel|second-secret|tokenHash/
    );
    expect(sessions[0]).not.toHaveProperty('id');
    expect(sessions[0]).not.toHaveProperty('tokenHash');
  });

  it('bloqueia desativação do único owner e agenda exclusão com a sessão atual', async () => {
    mocks.repository.deactivate.mockResolvedValue({ blocked: [{ id: 9, name: 'Projeto' }] });
    await expect(
      settingsService.deactivate(
        7,
        { id: 22, lastReauthenticatedAt: null },
        { currentPassword: 'senha-segura', confirmation: true },
        'req-5'
      )
    ).rejects.toMatchObject({ code: 'SOLE_PROJECT_OWNER' });

    mocks.repository.requestDeletion.mockResolvedValue({ request: { id: 3 } });
    await settingsService.requestDeletion(
      7,
      { id: 22, lastReauthenticatedAt: null },
      { currentPassword: 'senha-segura', confirmation: true },
      'req-6',
      new Date('2030-01-01T00:00:00Z')
    );
    expect(mocks.repository.requestDeletion).toHaveBeenCalledWith(
      7,
      22,
      new Date('2030-01-01T00:00:00Z'),
      new Date('2030-01-31T00:00:00Z'),
      expect.objectContaining({ action: 'ACCOUNT_DELETION_REQUESTED' })
    );
  });

  it('exporta ZIP JSON sem hashes, tokens ou segredos', async () => {
    mocks.repository.exportData.mockResolvedValue({
      ...activeUser,
      emailVerifiedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      memberships: [],
      responsibleTasks: [],
      sessions: [],
      privacyRequests: [],
      auditEvents: [],
      githubInstallationAuthorizations: []
    });
    mocks.repository.recordExport.mockResolvedValue({ id: 1 });
    const result = await settingsService.exportData(7, 'req-7', new Date('2030-01-01T00:00:00Z'));
    expect(result.filename).toMatch(/\.zip$/);
    const archive = await JSZip.loadAsync(result.zip, { checkCRC32: true });
    const profile = JSON.parse(await archive.file('profile.json').async('string'));
    expect(profile).toMatchObject({
      id: 7,
      name: 'Daniel Silva',
      email: 'daniel@example.test',
      accountStatus: 'ACTIVE'
    });
    expect(profile).not.toHaveProperty('passwordHash');
    const manifest = JSON.parse(await archive.file('manifest.json').async('string'));
    expect(manifest.generatedAt).toBe('2030-01-01T00:00:00.000Z');
    expect(manifest.files.sort()).toEqual(Object.keys(archive.files).sort());
    expect(result.zip.toString()).not.toMatch(/passwordHash|tokenHash|csrfToken|installationToken/);
  });

  it('gera o arquivo de uma exportação já registrada sem criar outro registro', async () => {
    mocks.repository.exportData.mockResolvedValue({
      ...activeUser,
      emailVerifiedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      memberships: [],
      responsibleTasks: [],
      sessions: [],
      privacyRequests: [],
      auditEvents: [],
      githubInstallationAuthorizations: []
    });
    const result = await settingsService.buildExportArchive(7, new Date('2030-01-01T00:00:00Z'));
    const archive = await JSZip.loadAsync(result.zip, { checkCRC32: true });
    const profile = JSON.parse(await archive.file('profile.json').async('string'));
    expect(profile).toMatchObject({
      id: 7,
      name: 'Daniel Silva',
      email: 'daniel@example.test',
      accountStatus: 'ACTIVE'
    });
    expect(profile).not.toHaveProperty('passwordHash');
    const manifest = JSON.parse(await archive.file('manifest.json').async('string'));
    expect(manifest.generatedAt).toBe('2030-01-01T00:00:00.000Z');
    expect(manifest.files.sort()).toEqual(Object.keys(archive.files).sort());
    expect(mocks.repository.recordExport).not.toHaveBeenCalled();
  });

  it('remove somente a conexão pessoal com a GitHub App após confirmar senha', async () => {
    mocks.repository.removeGithubAuthorization.mockResolvedValue({
      id: 5,
      projects: [{ id: 9, name: 'Preservado' }]
    });
    await settingsService.removeGithubAuthorization(
      7,
      { id: 22, lastReauthenticatedAt: null },
      5,
      { currentPassword: 'senha-segura', confirmation: true },
      'req-8'
    );
    expect(mocks.auth.verifyPassword).toHaveBeenCalledWith(7, 'senha-segura');
    mocks.auth.verifyPassword.mockResolvedValue(false);
    await expect(
      settingsService.removeGithubAuthorization(
        7,
        { id: 22 },
        5,
        { currentPassword: 'wrong', confirmation: true },
        'req-denied'
      )
    ).rejects.toMatchObject({ code: 'CURRENT_PASSWORD_INVALID' });
    expect(mocks.repository.removeGithubAuthorization).toHaveBeenCalledTimes(1);
    expect(mocks.repository.removeGithubAuthorization).toHaveBeenCalledWith(
      7,
      5,
      expect.any(Date),
      expect.objectContaining({ action: 'GITHUB_APP_CONNECTION_REMOVED' })
    );
  });

  it('exige reautenticação GitHub recente para operação sensível de conta GitHub-only', async () => {
    const now = new Date('2030-01-01T00:10:00Z');
    mocks.repository.account.mockResolvedValue({ ...activeUser, passwordHash: null });
    mocks.githubAuth.identity.mockResolvedValue({
      githubLogin: 'daniel',
      lastAuthenticatedAt: new Date('2030-01-01T00:09:00Z')
    });

    await expect(
      settingsService.requestDeletion(
        7,
        { id: 22, lastReauthenticatedAt: new Date('2029-12-31T23:00:00Z') },
        { confirmation: true },
        'req-github-stale',
        now
      )
    ).rejects.toMatchObject({ code: 'GITHUB_REAUTHENTICATION_REQUIRED' });

    for (const [identityAt, sessionAt] of [
      [new Date('2029-12-31T23:59:59.999Z'), now],
      [null, now],
      [now, null],
      [undefined, now]
    ]) {
      mocks.githubAuth.identity.mockResolvedValue(
        identityAt === undefined ? null : { lastAuthenticatedAt: identityAt }
      );
      await expect(
        settingsService.requestDeletion(
          7,
          { id: 22, lastReauthenticatedAt: sessionAt },
          { confirmation: true },
          'req-invalid-proof',
          now
        )
      ).rejects.toMatchObject({
        code:
          identityAt === undefined
            ? 'GITHUB_IDENTITY_NOT_LINKED'
            : 'GITHUB_REAUTHENTICATION_REQUIRED'
      });
    }
    expect(mocks.repository.requestDeletion).not.toHaveBeenCalled();
    mocks.githubAuth.identity.mockResolvedValue({
      lastAuthenticatedAt: new Date('2030-01-01T00:00:00Z')
    });
    mocks.repository.requestDeletion.mockResolvedValue({ request: { id: 12 } });
    await expect(
      settingsService.requestDeletion(
        7,
        { id: 22, lastReauthenticatedAt: new Date('2030-01-01T00:00:00Z') },
        { confirmation: true },
        'req-github-recent',
        now
      )
    ).resolves.toEqual({ id: 12 });
    expect(mocks.auth.verifyPassword).not.toHaveBeenCalled();
  });
});
