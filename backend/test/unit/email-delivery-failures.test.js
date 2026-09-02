import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  logger: { info: vi.fn(), error: vi.fn() }
}));

vi.mock('../../src/config/env.js', () => ({
  env: {
    emailFrom: 'no-reply@traceflow.test',
    passwordResetUrl: 'https://traceflow.test/reset-password',
    invitationAcceptUrl: 'https://traceflow.test/invitations/accept',
    emailVerificationUrl: 'https://traceflow.test/verify-email'
  }
}));
vi.mock('../../src/shared/email/email.provider.js', () => ({
  createEmailProvider: () => ({ send: mocks.send })
}));
vi.mock('../../src/shared/logger/index.js', () => ({ logger: mocks.logger }));

const { emailService } = await import('../../src/shared/email/email.service.js');

describe('falhas reais de entrega SMTP', () => {
  beforeEach(() => vi.clearAllMocks());

  it('distingue falha temporária de permanente sem propagar falso sucesso', async () => {
    mocks.send.mockRejectedValueOnce({ responseCode: 451, code: 'ETEMP' });
    await expect(
      emailService.sendEmailVerification({
        to: 'pessoa@example.invalid',
        token: 'token-artificial',
        expiresAt: new Date('2030-01-01'),
        userId: 7,
        name: 'Pessoa'
      })
    ).resolves.toEqual({ status: 'temporary_failure', accepted: false });

    mocks.send.mockRejectedValueOnce({ responseCode: 550, code: 'EPERM' });
    await expect(
      emailService.sendProjectInvitation({
        to: 'pessoa@example.invalid',
        token: 'token-artificial',
        expiresAt: new Date('2030-01-01'),
        projectName: 'Projeto',
        role: 'MEMBER',
        projectId: 9,
        invitationId: 12
      })
    ).resolves.toEqual({ status: 'permanent_failure', accepted: false });
    expect(mocks.logger.error).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(mocks.logger.error.mock.calls)).not.toContain('token-artificial');
  });
});
