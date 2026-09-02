import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => ({ post: vi.fn() }));
const catalogMock = vi.hoisted(() => ({ refreshProjects: vi.fn() }));
vi.mock('../../src/api/http-client.js', () => ({ httpClient: apiMock }));
vi.mock('../../src/features/projects/index.js', () => ({
  useProjectsCatalog: () => catalogMock
}));

import { AcceptInvitationPage } from '../../src/pages/AcceptInvitationPage.jsx';

function renderPage(path = '/invitations/accept?token=token-artificial-valid-1234567890') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/invitations/accept" element={<AcceptInvitationPage />} />
        <Route path="/projects/:id" element={<h1>Projeto carregado</h1>} />
        <Route path="/projects" element={<h1>Projetos</h1>} />
      </Routes>
    </MemoryRouter>
  );
}

function mockPendingInvitation() {
  apiMock.post.mockImplementation((path) => {
    if (path === '/projects/invitations/details')
      return Promise.resolve({
        data: {
          invitation: {
            project: { id: 9, name: 'Projeto artificial' },
            role: 'MEMBER',
            expiresAt: '2030-01-08T12:00:00.000Z',
            status: 'PENDING'
          }
        }
      });
    if (path === '/projects/invitations/accept')
      return Promise.resolve({ data: { membership: { projectId: 9 } } });
    if (path === '/projects/invitations/decline') return Promise.resolve({ data: {} });
    return Promise.reject(new Error(`URL inesperada: ${path}`));
  });
}

describe('AcceptInvitationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    catalogMock.refreshProjects.mockResolvedValue([]);
  });

  it('exibe contexto seguro e aceita o convite', async () => {
    mockPendingInvitation();
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText('Projeto artificial')).toBeInTheDocument();
    expect(screen.getByText('Membro')).toBeInTheDocument();
    expect(screen.getByText(/Válido até/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Aceitar convite' }));
    expect(await screen.findByRole('heading', { name: 'Projeto carregado' })).toBeInTheDocument();
    expect(apiMock.post).toHaveBeenCalledWith('/projects/invitations/accept', {
      token: 'token-artificial-valid-1234567890'
    });
    expect(catalogMock.refreshProjects).toHaveBeenCalledOnce();
  });

  it('recusa explicitamente sem criar associação', async () => {
    mockPendingInvitation();
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Recusar convite' }));
    expect(await screen.findByText(/Nenhuma associação foi criada/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aceitar convite' })).not.toBeInTheDocument();
    expect(apiMock.post).toHaveBeenCalledWith('/projects/invitations/decline', {
      token: 'token-artificial-valid-1234567890'
    });
    expect(catalogMock.refreshProjects).not.toHaveBeenCalled();
  });

  it('não faz requisição com link sem token', async () => {
    renderPage('/invitations/accept');
    expect(await screen.findByText(/link do convite está incompleto/i)).toBeInTheDocument();
    await waitFor(() => expect(apiMock.post).not.toHaveBeenCalled());
  });

  it.each([
    ['EXPIRED', 'Este convite expirou.'],
    ['REVOKED', 'Este convite foi revogado pelo projeto.'],
    ['ACCEPTED', 'Este convite já foi aceito.']
  ])('explica o estado %s sem oferecer nova mutação', async (status, message) => {
    apiMock.post.mockResolvedValueOnce({
      data: {
        invitation: {
          project: { id: 9, name: 'Projeto artificial' },
          role: 'MEMBER',
          expiresAt: '2030-01-08T12:00:00.000Z',
          status
        }
      }
    });
    renderPage();

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aceitar convite' })).not.toBeInTheDocument();
  });

  it('impede aceite duplicado enquanto a primeira mutação está pendente', async () => {
    let resolveAccept;
    apiMock.post.mockImplementation((path) => {
      if (path === '/projects/invitations/details')
        return Promise.resolve({
          data: {
            invitation: {
              project: { id: 9, name: 'Projeto artificial' },
              role: 'MEMBER',
              expiresAt: '2030-01-08T12:00:00.000Z',
              status: 'PENDING'
            }
          }
        });
      if (path === '/projects/invitations/accept')
        return new Promise((resolve) => {
          resolveAccept = resolve;
        });
      return Promise.reject(new Error(`URL inesperada: ${path}`));
    });
    renderPage();
    const button = await screen.findByRole('button', { name: 'Aceitar convite' });

    fireEvent.click(button);
    fireEvent.click(button);
    expect(
      apiMock.post.mock.calls.filter(([path]) => path === '/projects/invitations/accept')
    ).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Aceitando...' })).toBeDisabled();
    await act(async () => resolveAccept({ data: { membership: { projectId: 9 } } }));
  });
});
