import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ state: null, role: 'MEMBER' }));
vi.mock('../../src/features/projects/index.js', () => ({
  useProjectsCatalog: () => ({ projects: [{ id: 1, name: 'Projeto' }], loading: false }),
  ProjectSectionNav: () => null
}));
vi.mock('../../src/features/defects/hooks/useDefects.js', () => ({
  useDefects: () => mocks.state,
  useDefectOptions: () => ({ members: [], membership: { role: mocks.role } })
}));
import { DefectsScreen } from '../../src/features/defects/DefectsScreen.jsx';
import { filtersDefault } from '../../src/features/defects/model/defects.js';

const show = () =>
  render(
    <MemoryRouter initialEntries={['/projects/1/defects']}>
      <Routes>
        <Route path="/projects/:projectId/defects" element={<DefectsScreen />} />
      </Routes>
    </MemoryRouter>
  );
beforeEach(() => {
  mocks.role = 'MEMBER';
  mocks.state = {
    loading: false,
    error: null,
    warning: '',
    filters: { ...filtersDefault },
    catalog: { items: [], total: 0, page: 1, summary: { total: 0 } },
    changeFilter: vi.fn(),
    clear: vi.fn(),
    load: vi.fn()
  };
});

describe('defects empty catalog', () => {
  it.each(['MEMBER', 'VIEWER'])(
    'removes explanatory empty-state text for %s without hiding the catalog',
    (role) => {
      mocks.role = role;
      show();
      expect(
        screen.queryByText('Nenhum defeito registrado neste projeto.')
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(
          'Defeitos são registrados a partir de passos com falha em execuções de casos de teste.'
        )
      ).not.toBeInTheDocument();
      expect(screen.queryByText('Nenhum defeito corresponde aos filtros.')).not.toBeInTheDocument();
      expect(screen.getByRole('list', { name: 'Defeitos do projeto' })).toBeInTheDocument();
      if (role === 'MEMBER')
        expect(screen.getByRole('button', { name: /Registrar defeito/ })).toBeInTheDocument();
      else
        expect(screen.queryByRole('button', { name: /Registrar defeito/ })).not.toBeInTheDocument();
    }
  );

  it('preserves an accessible no-results message when filters exclude all defects', () => {
    mocks.state.filters.search = 'inexistente';
    show();
    expect(screen.getByText('Nenhum defeito corresponde aos filtros.')).toHaveAttribute(
      'role',
      'status'
    );
    expect(screen.queryByText(/Defeitos são registrados a partir/)).not.toBeInTheDocument();
  });

  it('does not show filter no-results before loading finishes', () => {
    mocks.state.loading = true;
    mocks.state.filters.search = 'inexistente';
    show();
    expect(screen.queryByText('Nenhum defeito corresponde aos filtros.')).not.toBeInTheDocument();
    expect(screen.getByText('Carregando defeitos…')).toBeInTheDocument();
  });
});
