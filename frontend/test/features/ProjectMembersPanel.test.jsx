import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
vi.mock('../../src/api/api.js', () => ({ api: apiMock }));
import { ProjectMembersPanel } from '../../src/features/members/ProjectMembersPanel.jsx';

const member = { id: 2, role: 'MEMBER', isActive: true, user: { name: 'Pessoa artificial', email: 'p***@example.invalid' } };

function mockList(role = 'OWNER') {
  apiMock.get.mockImplementation((path) => {
    if (path.endsWith('/members')) return Promise.resolve({ data: { currentMembership: { id: 1, role, isActive: true }, members: [member] } });
    if (path.endsWith('/invitations')) return Promise.resolve({ data: { invitations: [] } });
    return Promise.reject(new Error(`URL inesperada: ${path}`));
  });
}

describe('ProjectMembersPanel', () => {
  beforeEach(() => { vi.clearAllMocks(); window.confirm = vi.fn(() => true); });

  it('exibe dados minimizados e oculta administração para MEMBER', async () => {
    mockList('MEMBER');
    render(<ProjectMembersPanel projectId="1" />);
    expect(await screen.findByText('Pessoa artificial')).toBeInTheDocument();
    expect(screen.getByText('p***@example.invalid')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desativar' })).not.toBeInTheDocument();
    expect(apiMock.get).not.toHaveBeenCalledWith('/projects/1/invitations');
  });

  it('permite ao OWNER alterar papel e recarrega a lista', async () => {
    mockList('OWNER');
    apiMock.patch.mockResolvedValue({ data: { membership: { ...member, role: 'MANAGER' } } });
    const user = userEvent.setup();
    render(<ProjectMembersPanel projectId="1" />);
    const select = await screen.findByLabelText('Perfil de Pessoa artificial');
    await user.selectOptions(select, 'MANAGER');
    await waitFor(() => expect(apiMock.patch).toHaveBeenCalledWith('/projects/1/members/2', { role: 'MANAGER' }));
  });

  it('permite saída própria confirmada sem tentar recarregar o projeto', async () => {
    mockList('MEMBER');
    apiMock.delete.mockResolvedValue({});
    const user = userEvent.setup();
    render(<ProjectMembersPanel projectId="1" />);
    await user.click(await screen.findByRole('button', { name: 'Sair do projeto' }));
    expect(apiMock.delete).toHaveBeenCalledWith('/projects/1/members/me');
    expect(await screen.findByText('Você saiu do projeto.')).toBeInTheDocument();
  });

  it('confirma desativação e envia convite sem expor token', async () => {
    mockList('OWNER');
    apiMock.delete.mockResolvedValue({});
    apiMock.post.mockResolvedValue({ data: { invitation: { id: 4, email: 'invite@example.invalid', role: 'VIEWER' } } });
    const user = userEvent.setup();
    render(<ProjectMembersPanel projectId="1" />);
    await user.click(await screen.findByRole('button', { name: 'Desativar' }));
    expect(window.confirm).toHaveBeenCalled();
    expect(apiMock.delete).toHaveBeenCalledWith('/projects/1/members/2');
    await user.type(screen.getByLabelText('E-mail do convite'), 'invite@example.invalid');
    await user.selectOptions(screen.getByLabelText('Papel do convite'), 'VIEWER');
    await user.click(screen.getByRole('button', { name: 'Enviar convite' }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith('/projects/1/invitations', { email: 'invite@example.invalid', role: 'VIEWER' }));
  });
});
