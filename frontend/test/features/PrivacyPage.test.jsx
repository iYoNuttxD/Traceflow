import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmProvider } from '../../src/shared/index.js';

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
vi.mock('../../src/api/http-client.js', () => ({ httpClient: apiMock }));
vi.mock('../../src/features/auth/AuthContext.jsx', () => ({ useAuth: () => ({ user: { name: 'Pessoa artificial', email: 'person@example.invalid' }, refresh: vi.fn() }) }));
import { PrivacyPage } from '../../src/features/privacy/PrivacyPage.jsx';

function mockLoads() {
  apiMock.get.mockImplementation((path) => {
    if (path === '/account/sessions') return Promise.resolve({ data: { sessions: [{ id: 7, current: true }] } });
    if (path === '/account/audit-events') return Promise.resolve({ data: { events: [{ id: 1, action: 'LOGIN_SUCCEEDED', occurredAt: '2026-01-01T00:00:00.000Z' }] } });
    if (path === '/account/deletion-request') return Promise.resolve({ data: { request: null } });
    return Promise.reject(new Error(`URL inesperada: ${path}`));
  });
}

describe('PrivacyPage', () => {
  beforeEach(() => { vi.clearAllMocks(); mockLoads(); });
  it('exibe sessões, exportação, exclusão e atividade sem dados técnicos', async () => {
    render(<MemoryRouter><ConfirmProvider><PrivacyPage /></ConfirmProvider></MemoryRouter>);
    expect(await screen.findByText('Sessão atual')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exportar meus dados' })).toBeInTheDocument();
    expect(screen.getByText(/LOGIN_SUCCEEDED/)).toBeInTheDocument();
    expect(screen.queryByText(/tokenHash|csrfTokenHash/)).not.toBeInTheDocument();
  });
  it('edita o próprio perfil com confirmação de senha', async () => {
    apiMock.patch.mockResolvedValue({ data: { user: { name: 'Novo nome' } } });
    const user = userEvent.setup();
    render(<MemoryRouter><ConfirmProvider><PrivacyPage /></ConfirmProvider></MemoryRouter>);
    await screen.findByText('Sessão atual');
    await user.clear(screen.getByLabelText('Nome'));
    await user.type(screen.getByLabelText('Nome'), 'Novo nome');
    await user.type(screen.getByLabelText('Senha atual'), 'SenhaSegura123');
    await user.click(screen.getByRole('button', { name: 'Salvar perfil' }));
    await waitFor(() => expect(apiMock.patch).toHaveBeenCalledWith('/account/profile', expect.objectContaining({ name: 'Novo nome', currentPassword: 'SenhaSegura123' })));
  });
});
