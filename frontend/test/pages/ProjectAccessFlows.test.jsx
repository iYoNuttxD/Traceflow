import { MemoryRouter, Route, Routes } from 'react-router';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => ({
  joinDetails: vi.fn(),
  joinProject: vi.fn()
}));

vi.mock('../../src/features/members/index.js', () => ({
  projectMembersApi: apiMock
}));

import { JoinProjectPage } from '../../src/pages/JoinProjectPage.jsx';
import { ProjectJoinCard } from '../../src/features/projects/components/ProjectJoinCard.jsx';
import { parseProjectAccessInput } from '../../src/features/projects/services/project-access-input.js';

function renderJoin(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/join" element={<JoinProjectPage />} />
        <Route path="/join/:accessCode" element={<JoinProjectPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ingresso por código de projeto', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.joinDetails.mockResolvedValue({
      project: { id: 7, name: 'Projeto compartilhado' },
      role: 'MEMBER'
    });
    apiMock.joinProject.mockResolvedValue({
      data: {
        message: 'Entrada no projeto realizada com sucesso.',
        project: { id: 7, name: 'Projeto compartilhado' },
        membership: { role: 'MEMBER' }
      }
    });
  });

  it('aceita código e link interno, mas rejeita origem externa e open redirect', () => {
    expect(parseProjectAccessInput('trc-abcd1234', 'https://traceflow.test')).toBe('TRC-ABCD1234');
    expect(
      parseProjectAccessInput('https://traceflow.test/join/TRC-ABCDEF12', 'https://traceflow.test')
    ).toBe('TRC-ABCDEF12');
    expect(
      parseProjectAccessInput('https://evil.test/join/TRC-ABCDEF12', 'https://traceflow.test')
    ).toBe('');
    expect(
      parseProjectAccessInput(
        'https://traceflow.test/projects?next=/join/TRC-ABCDEF12',
        'https://traceflow.test'
      )
    ).toBe('');
  });

  it('mostra detalhes antes da confirmação e envia somente o accessCode', async () => {
    const user = userEvent.setup();
    renderJoin('/join/TRC-ABCDEF12');

    expect(await screen.findByText('Projeto compartilhado')).toBeInTheDocument();
    expect(screen.getByText('Membro')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Nome|E-mail/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Entrar no projeto' }));
    expect(apiMock.joinProject).toHaveBeenCalledWith({ accessCode: 'TRC-ABCDEF12' });
    expect(
      await screen.findByText('Entrada no projeto realizada com sucesso.')
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir projeto' })).toHaveAttribute(
      'href',
      '/projects/7'
    );
  });

  it('normaliza link colado e navega para a confirmação sem executar URL arbitrária', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/projects']}>
        <Routes>
          <Route path="/projects" element={<ProjectJoinCard />} />
          <Route path="/join/:accessCode" element={<JoinProjectPage />} />
        </Routes>
      </MemoryRouter>
    );
    await user.type(
      screen.getByLabelText('Código ou link de acesso'),
      `${window.location.origin}/join/TRC-1234ABCD`
    );
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(apiMock.joinDetails).toHaveBeenCalledWith('TRC-1234ABCD'));
    expect(await screen.findByText('Projeto compartilhado')).toBeInTheDocument();
  });

  it('mantém erro público de código inválido', async () => {
    apiMock.joinDetails.mockRejectedValue({
      response: { status: 404, data: { message: 'Código de acesso inválido.' } }
    });
    renderJoin('/join/TRC-ABCDEF12');
    expect(await screen.findByText('Código de acesso inválido.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Entrar no projeto' })).not.toBeInTheDocument();
  });
});
