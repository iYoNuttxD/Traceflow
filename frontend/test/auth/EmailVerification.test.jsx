import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resendEmailVerification: vi.fn(),
  verifyEmail: vi.fn(),
  auth: { user: null, refresh: vi.fn() }
}));
vi.mock('../../src/features/auth/api/auth.api.js', () => ({ authApi: mocks }));
vi.mock('../../src/features/auth/AuthContext.jsx', () => ({ useAuth: () => mocks.auth }));

const { EmailVerificationBanner } =
  await import('../../src/features/auth/components/EmailVerificationBanner.jsx');
const { VerifyEmailScreen } = await import('../../src/features/auth/pages/VerifyEmailScreen.jsx');

describe('verificação de e-mail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.user = null;
  });

  it('reenvia a verificação e apresenta o resultado sem falso sucesso local', async () => {
    mocks.resendEmailVerification.mockResolvedValue({
      data: { message: 'Novo e-mail de verificação enviado.' }
    });
    render(<EmailVerificationBanner user={{ emailVerifiedAt: null }} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reenviar verificação' }));
    expect(mocks.resendEmailVerification).toHaveBeenCalledOnce();
    expect(await screen.findByText('E-mail enviado com sucesso.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reenviar verificação' })).toHaveClass(
      'button-outline',
      'button-compact'
    );
  });

  it('respeita o cooldown informado pelo rate limiter sem novo envio imediato', async () => {
    mocks.resendEmailVerification.mockRejectedValue({
      response: {
        status: 429,
        data: {
          code: 'RATE_LIMITED',
          message: 'Muitas requisições. Tente novamente mais tarde.',
          retryAfterSeconds: 42
        }
      }
    });
    render(<EmailVerificationBanner user={{ emailVerifiedAt: null }} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reenviar verificação' }));

    expect(await screen.findByRole('button', { name: 'Reenviar em 42s' })).toBeDisabled();
    expect(mocks.resendEmailVerification).toHaveBeenCalledOnce();
  });

  it('impede clique concorrente enquanto o reenvio está em andamento', async () => {
    let resolveRequest;
    mocks.resendEmailVerification.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        })
    );
    render(<EmailVerificationBanner user={{ emailVerifiedAt: null }} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reenviar verificação' }));

    const sending = screen.getByRole('button', { name: 'Reenviando...' });
    expect(sending).toBeDisabled();
    expect(sending).toHaveAttribute('aria-busy', 'true');
    resolveRequest({ data: { message: 'ok' } });
    expect(await screen.findByText('E-mail enviado com sucesso.')).toBeInTheDocument();
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

  it('envia uma única confirmação por token sob StrictMode', async () => {
    mocks.verifyEmail.mockResolvedValue({ data: { message: 'E-mail verificado com sucesso.' } });
    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/verify-email?token=token-strict-mode']}>
          <VerifyEmailScreen />
        </MemoryRouter>
      </StrictMode>
    );

    expect(await screen.findByText('E-mail verificado com sucesso.')).toBeInTheDocument();
    expect(mocks.verifyEmail).toHaveBeenCalledTimes(1);
    expect(mocks.verifyEmail).toHaveBeenCalledWith('token-strict-mode');
  });

  it('atualiza o AuthContext quando a sessão corresponde ao e-mail verificado', async () => {
    mocks.auth.user = { id: 7, emailVerifiedAt: null };
    mocks.verifyEmail.mockResolvedValue({
      data: { message: 'E-mail verificado com sucesso.', user: { id: 7 } }
    });
    render(
      <MemoryRouter initialEntries={['/verify-email?token=token-artificial']}>
        <VerifyEmailScreen />
      </MemoryRouter>
    );
    await screen.findByText('E-mail verificado com sucesso.');
    expect(mocks.auth.refresh).toHaveBeenCalledOnce();
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

  it.each([
    ['inválido', 'Token de verificação inválido.'],
    ['expirado', 'Token de verificação expirado.'],
    ['já utilizado', 'Token de verificação já utilizado.']
  ])('apresenta erro seguro para token %s', async (_state, message) => {
    mocks.verifyEmail.mockRejectedValueOnce({
      response: { status: 400, data: { message } }
    });
    render(
      <MemoryRouter initialEntries={['/verify-email?token=token-artificial']}>
        <VerifyEmailScreen />
      </MemoryRouter>
    );

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Prisma|node_modules|stack/i);
  });
});
