import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmProvider } from '../../src/shared/index.js';
import { TestCasesPage } from '../../src/pages/TestCasesPage.jsx';
import { DefectsPage } from '../../src/pages/DefectsPage.jsx';

vi.mock('../../src/features/projects/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  useProjectsCatalog: () => ({
    projects: [{ id: 1, name: 'Projeto de qualidade' }],
    loading: false
  })
}));
vi.mock('../../src/features/members/index.js', () => ({
  membersApi: {
    list: vi.fn().mockResolvedValue({ members: [], currentMembership: { role: 'VIEWER' } })
  }
}));
vi.mock('../../src/features/testCases/api/test-cases.api.js', () => ({
  testCasesApi: {
    list: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, summary: { total: 0 } })
  }
}));
vi.mock('../../src/features/defects/api/defects.api.js', () => ({
  defectsApi: {
    list: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, summary: { total: 0 } })
  }
}));

describe('quality page landmarks', () => {
  it.each([
    ['test-cases', 'Casos de teste', TestCasesPage],
    ['defects', 'Defeitos', DefectsPage]
  ])(
    '%s exposes its heading and project navigation inside one main landmark',
    async (path, title, Page) => {
      render(
        <MemoryRouter initialEntries={[`/projects/1/${path}`]}>
          <ConfirmProvider>
            <Routes>
              <Route path={`/projects/:projectId/${path}`} element={<Page />} />
            </Routes>
          </ConfirmProvider>
        </MemoryRouter>
      );
      const heading = await screen.findByRole('heading', { level: 1, name: title });
      const main = screen.getByRole('main');
      expect(main).toContainElement(heading);
      expect(within(main).getByRole('navigation', { name: 'Navegação do projeto' })).toBeVisible();
      expect(screen.getAllByRole('main')).toHaveLength(1);
    }
  );
});
