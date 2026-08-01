import { MemoryRouter, Route, Routes } from 'react-router';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resendEmailVerification: vi.fn(),
  verifyEmail: vi.fn()
}));
vi.mock('../../src/features/auth/api/auth.api.js', () => ({ authApi: mocks }));

const { EmailVerificationBanner } =
  await import('../../src/features/auth/components/EmailVerificationBanner.jsx');
const { VerifyEmailScreen } = await import('../../src/features/auth/pages/VerifyEmailScreen.jsx');

describe('verificação de e-mail', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reenvia a verificação e apresenta o resultado sem falso sucesso local', async () => {
    mocks.resendEmailVerification.mockResolvedValue({
      data: { message: 'Novo e-mail de verificação enviado.' }
    });
    render(<EmailVerificationBanner user={{ emailVerifiedAt: null }} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reenviar verificação' }));
    expect(mocks.resendEmailVerification).toHaveBeenCalledOnce();
    expect(await screen.findByText('Novo e-mail de verificação enviado.')).toBeInTheDocument();
  });

  it('consome o token da URL e exibe confirmação retornada pelo backend', async () => {
    mocks.verifyEmail.mockResolvedValue({ data: { message: 'E-mail verificado com sucesso.' } });
    render(
      <MemoryRouter initialEntries={['/verify-email?token=token-artificial']}>
        <Routes>
          <Route path="/verify-email" element={<VerifyEmailScreen />} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => expect(mocks.verifyEmail).toHaveBeenCalledWith('token-artificial'));
    expect(await screen.findByText('E-mail verificado com sucesso.')).toBeInTheDocument();
  });

  it('rejeita link sem token sem chamar a API', async () => {
    render(
      <MemoryRouter initialEntries={['/verify-email']}>
        <VerifyEmailScreen />
      </MemoryRouter>
    );
    expect(
      await screen.findByText('Link de verificação inválido ou incompleto.')
    ).toBeInTheDocument();
    expect(mocks.verifyEmail).not.toHaveBeenCalled();
  });
});
