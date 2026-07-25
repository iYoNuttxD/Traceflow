import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getProjectArtifacts = vi.hoisted(() => vi.fn());
vi.mock('../../src/api/api.js', () => ({ getProjectArtifacts }));

import { RepositoryInfoPage } from '../../src/pages/RepositoryInfoPage.jsx';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/projects/1/repository']}>
      <Routes><Route path="/projects/:projectId/repository" element={<RepositoryInfoPage />} /></Routes>
    </MemoryRouter>
  );
}

describe('RepositoryInfoPage RF06', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getProjectArtifacts.mockResolvedValue({
      project: { id: 1, name: 'Projeto E9' },
      summary: { total: 0, commits: 0, pullRequests: 0, issues: 0, metadataCompletenessPercentage: 0 },
      artifacts: []
    });
  });

  it('preserva loading, vazio e endpoint consolidado sem filtros', async () => {
    renderPage();
    expect(screen.getByText('Carregando artefatos do repositório...')).toBeInTheDocument();
    expect(await screen.findByText('Nenhum artefato GitHub foi importado para este projeto.')).toBeInTheDocument();
    expect(getProjectArtifacts).toHaveBeenCalledWith('1', { type: '', startDate: '', endDate: '' });
  });

  it('combina tipo e intervalo de datas no filtro existente', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Nenhum artefato GitHub foi importado para este projeto.');
    await user.selectOptions(screen.getByLabelText('Tipo de artefato'), 'pull_request');
    await user.type(screen.getByLabelText('Data inicial'), '2026-01-01');
    await user.type(screen.getByLabelText('Data final'), '2026-01-31');
    await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
    expect(getProjectArtifacts).toHaveBeenLastCalledWith('1', {
      type: 'pull_request', startDate: '2026-01-01', endDate: '2026-01-31'
    });
    expect(await screen.findByText('Nenhum artefato encontrado para os filtros selecionados.')).toBeInTheDocument();
  });
});
