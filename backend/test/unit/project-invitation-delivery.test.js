import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  repository: { createUnlessPending: vi.fn() },
  email: { sendProjectInvitation: vi.fn() },
  audit: { recordOperational: vi.fn() },
  logger: { info: vi.fn() }
}));

vi.mock('../../src/config/env.js', () => ({
  env: { invitationTtlMs: 604800000, isTest: true }
}));
vi.mock('../../src/modules/projects/project-invitation.repository.js', () => ({
  projectInvitationRepository: mocks.repository
}));
vi.mock('../../src/shared/email/index.js', () => ({ emailService: mocks.email }));
vi.mock('../../src/modules/audit/audit.service.js', () => ({ auditService: mocks.audit }));
vi.mock('../../src/shared/logger/index.js', () => ({ logger: mocks.logger }));

const { projectInvitationService } =
  await import('../../src/modules/projects/services/project-invitation.service.js');

describe('convite quando SMTP falha', () => {
  beforeEach(() => vi.clearAllMocks());

  it('preserva o convite e retorna o estado sanitizado de entrega ao OWNER', async () => {
    mocks.repository.createUnlessPending.mockResolvedValue({
      invitation: {
        id: 12,
        projectId: 9,
        email: 'pessoa@example.invalid',
        role: 'MEMBER',
        expiresAt: new Date('2030-01-01'),
        project: { name: 'Projeto' }
      }
    });
    mocks.email.sendProjectInvitation.mockResolvedValue({
      status: 'temporary_failure',
      accepted: false
    });
    const result = await projectInvitationService.create(
      9,
      7,
      { email: 'Pessoa@Example.invalid', role: 'MEMBER' },
      'request-1'
    );
    expect(result.emailDelivery).toEqual({ status: 'temporary_failure', accepted: false });
    expect(result.invitation).toMatchObject({ id: 12, email: 'pessoa@example.invalid' });
    expect(result.token).toEqual(expect.any(String));
    expect(mocks.audit.recordOperational).toHaveBeenCalledOnce();
  });
});
