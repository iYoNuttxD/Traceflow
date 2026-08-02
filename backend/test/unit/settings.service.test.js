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
  github: { listRepositories: vi.fn() }
}));

vi.mock('../../src/config/env.js', () => ({
  env: {
    emailChangeTtlMs: 1_800_000,
    accountReactivationTtlMs: 1_800_000,
    accountDeletionGraceDays: 30,
    exportFileTtlMinutes: 15,
    auditRetentionDays: 365
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

const { settingsService } = await import('../../src/modules/settings/settings.service.js');

const activeUser = {
  id: 7,
  name: 'Daniel Silva',
  username: 'daniel',
  email: 'daniel@example.test',
  accountStatus: 'ACTIVE',
  mustSetUsername: false,
  usernameChangedAt: null
};

describe('configurações de conta L2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.repository.account.mockResolvedValue(activeUser);
    mocks.repository.pendingEmailChange.mockResolvedValue(null);
    mocks.repository.findUserByEmail.mockResolvedValue(null);
    mocks.auth.verifyPassword.mockResolvedValue(true);
    mocks.auth.hashPassword.mockResolvedValue('argon2-hash');
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
    expect(persisted.tokenHash).toHaveLength(64);
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

  it('lista apenas identificadores públicos de sessão', async () => {
    mocks.repository.listSessions.mockResolvedValue([
      {
        publicId: 'b6360643-0216-4cb7-873b-4e851250f524',
        rememberMe: false,
        createdAt: new Date(),
        lastSeenAt: new Date(),
        expiresAt: new Date(),
        revokedAt: null
      }
    ]);
    const sessions = await settingsService.sessions(7, 'b6360643-0216-4cb7-873b-4e851250f524');
    expect(sessions[0]).toMatchObject({ current: true, sessionId: expect.any(String) });
    expect(sessions[0]).not.toHaveProperty('id');
    expect(sessions[0]).not.toHaveProperty('tokenHash');
  });

  it('bloqueia desativação e exclusão do único owner e mantém a sessão atual no pedido', async () => {
    mocks.repository.deactivate.mockResolvedValue({ blocked: [{ id: 9, name: 'Projeto' }] });
    await expect(
      settingsService.deactivate(
        7,
        22,
        { currentPassword: 'senha-segura', confirmation: true },
        'req-5'
      )
    ).rejects.toMatchObject({ code: 'SOLE_PROJECT_OWNER' });

    mocks.repository.requestDeletion.mockResolvedValue({ request: { id: 3 } });
    await settingsService.requestDeletion(
      7,
      22,
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
    expect(result.zip.subarray(0, 2).toString()).toBe('PK');
    expect(result.zip.toString()).not.toMatch(/passwordHash|tokenHash|csrfToken|installationToken/);
  });

  it('remove somente autorização pessoal do GitHub após confirmar senha', async () => {
    mocks.repository.removeGithubAuthorization.mockResolvedValue({
      id: 5,
      projects: [{ id: 9, name: 'Preservado' }]
    });
    await settingsService.removeGithubAuthorization(
      7,
      5,
      { currentPassword: 'senha-segura', confirmation: true },
      'req-8'
    );
    expect(mocks.repository.removeGithubAuthorization).toHaveBeenCalledWith(
      7,
      5,
      expect.any(Date),
      expect.objectContaining({ action: 'GITHUB_AUTHORIZATION_REMOVED' })
    );
  });
});
