import { act, fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../src/api/http-client.js', () => ({ httpClient: apiMock }));
import { ProjectAuditPage } from '../../src/features/privacy/ProjectAuditPage.jsx';

describe('ProjectAuditPage', () => {
  it('renderiza a trilha administrativa minimizada do projeto', async () => {
    apiMock.get.mockResolvedValue({
      data: {
        events: [
          {
            id: 1,
            action: 'PROJECT_MEMBER_ROLE_CHANGED',
            result: 'SUCCESS',
            email: 'private-audit@example.test',
            token: 'private-token-value',
            password: 'private-password-value'
          }
        ]
      }
    });
    render(
      <MemoryRouter initialEntries={['/projects/9/audit']}>
        <Routes>
          <Route path="/projects/:projectId/audit" element={<ProjectAuditPage />} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText(/PROJECT_MEMBER_ROLE_CHANGED — SUCCESS/)).toBeInTheDocument();
    expect(apiMock.get).toHaveBeenCalledWith('/projects/9/audit-events', {});
    expect(document.body).not.toHaveTextContent(
      /private-audit|private-token-value|private-password-value|email|token|password/i
    );
  });
});

it('ignora a resposta da auditoria anterior depois de navegar para outro projeto', async () => {
  let resolveOld;
  const old = new Promise((resolve) => {
    resolveOld = resolve;
  });
  apiMock.get.mockReset();
  apiMock.get.mockReturnValueOnce(old).mockResolvedValue({
    data: { events: [{ id: 2, action: 'CURRENT_PROJECT', result: 'SUCCESS' }] }
  });
  render(
    <MemoryRouter initialEntries={['/projects/9/audit']}>
      <Link to="/projects/10/audit">Outro projeto</Link>
      <Routes>
        <Route path="/projects/:projectId/audit" element={<ProjectAuditPage />} />
      </Routes>
    </MemoryRouter>
  );
  fireEvent.click(screen.getByRole('link', { name: 'Outro projeto' }));
  expect(await screen.findByText('CURRENT_PROJECT — SUCCESS')).toBeInTheDocument();
  await act(async () => {
    resolveOld({ data: { events: [{ id: 1, action: 'OBSOLETE_PROJECT', result: 'SUCCESS' }] } });
    await old;
  });
  expect(screen.getByText('CURRENT_PROJECT — SUCCESS')).toBeInTheDocument();
  expect(screen.queryByText(/OBSOLETE_PROJECT/)).not.toBeInTheDocument();
  expect(apiMock.get.mock.calls.map(([url]) => url)).toEqual([
    '/projects/9/audit-events',
    '/projects/10/audit-events'
  ]);
});

it('limpa eventos e erros carregados quando muda o projeto, inclusive enquanto a nova leitura está pendente', async () => {
  let resolveNext, rejectOld;
  const next = new Promise((resolve) => {
    resolveNext = resolve;
  });
  const old = new Promise((_resolve, reject) => {
    rejectOld = reject;
  });
  apiMock.get.mockReset();
  apiMock.get
    .mockResolvedValueOnce({ data: { events: [{ id: 1, action: 'FIRST', result: 'SUCCESS' }] } })
    .mockReturnValueOnce(next)
    .mockRejectedValueOnce({
      response: { status: 400, data: { message: 'Erro do projeto anterior' } }
    })
    .mockReturnValueOnce(old)
    .mockResolvedValue({ data: { events: [{ id: 5, action: 'FINAL', result: 'SUCCESS' }] } });
  render(
    <MemoryRouter initialEntries={['/projects/1/audit']}>
      {[2, 3, 4, 5].map((id) => (
        <Link key={id} to={'/projects/' + id + '/audit'}>
          {'Projeto ' + id}
        </Link>
      ))}
      <Routes>
        <Route path="/projects/:projectId/audit" element={<ProjectAuditPage />} />
      </Routes>
    </MemoryRouter>
  );
  await screen.findByText('FIRST — SUCCESS');
  fireEvent.click(screen.getByRole('link', { name: 'Projeto 2' }));
  expect(screen.queryByText('FIRST — SUCCESS')).not.toBeInTheDocument();
  await act(async () => {
    resolveNext({ data: { events: [] } });
    await next;
  });
  fireEvent.click(screen.getByRole('link', { name: 'Projeto 3' }));
  await screen.findByText('Erro do projeto anterior');
  fireEvent.click(screen.getByRole('link', { name: 'Projeto 4' }));
  expect(screen.queryByText('Erro do projeto anterior')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name: 'Projeto 5' }));
  await screen.findByText('FINAL — SUCCESS');
  await act(async () => {
    rejectOld({ response: { status: 400, data: { message: 'Erro obsoleto' } } });
    await old.catch(() => {});
  });
  expect(screen.getByText('FINAL — SUCCESS')).toBeInTheDocument();
  expect(screen.queryByText(/Erro obsoleto|Erro do projeto anterior/)).not.toBeInTheDocument();
});
