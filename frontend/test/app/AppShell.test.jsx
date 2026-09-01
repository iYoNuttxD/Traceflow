import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '../../src/app/layout/AppShell.jsx';
import { SIDEBAR_STORAGE_KEY } from '../../src/app/layout/sidebar-preference.js';
import { useQuickProjects } from '../../src/app/layout/useQuickProjects.js';
import { ThemeProvider } from '../../src/app/theme/ThemeProvider.jsx';
import { ProjectsCatalogProvider } from '../../src/features/projects/index.js';
import { quickProjectStorageKeys } from '../../src/app/layout/quick-projects.js';

const mocks = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock('../../src/features/projects/api/projects.api.js', () => ({
  projectsApi: { list: mocks.list }
}));

const user = {
  id: 7,
  name: 'Daniel Ganz Musse',
  email: 'daniel@example.invalid'
};
const projects = [
  { id: 1, name: 'Alpha' },
  { id: 2, name: 'Beta' },
  { id: 3, name: 'Gamma' },
  { id: 4, name: 'Delta' },
  { id: 5, name: 'Epsilon' },
  { id: 6, name: 'Zeta' }
];

function mockViewport({ mobile = false, tablet = false, dark = false } = {}) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches:
      (query === '(max-width: 720px)' && mobile) ||
      (query === '(min-width: 721px) and (max-width: 1180px)' && tablet) ||
      (query === '(prefers-color-scheme: dark)' && dark),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }));
}

function renderShell({ route = '/projects', onLogout = vi.fn() } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <ThemeProvider>
        <ProjectsCatalogProvider>
          <AppShell user={user} onLogout={onLogout}>
            <button type="button">Conteúdo da página</button>
          </AppShell>
        </ProjectsCatalogProvider>
      </ThemeProvider>
    </MemoryRouter>
  );
}

function PinLimitProbe() {
  const { feedback, togglePinned } = useQuickProjects({
    projects,
    userId: user.id,
    activeProjectId: null,
    catalogLoading: false,
    catalogError: null
  });
  return (
    <>
      <button type="button" onClick={() => togglePinned(6)}>
        Fixar sexto
      </button>
      <output>{feedback}</output>
    </>
  );
}

describe('AppShell', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockViewport();
    mocks.list.mockResolvedValue({ data: { projects } });
  });

  it('inicia expandida no desktop, recolhe e restaura a preferência', async () => {
    const interaction = userEvent.setup();
    const first = renderShell();
    const shell = document.querySelector('.trace-shell');
    expect(shell).toHaveAttribute('data-sidebar-state', 'expanded');
    await interaction.click(screen.getByRole('button', { name: 'Recolher sidebar' }));
    expect(shell).toHaveAttribute('data-sidebar-state', 'collapsed');
    expect(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe('true');
    first.unmount();

    renderShell();
    expect(document.querySelector('.trace-shell')).toHaveAttribute(
      'data-sidebar-state',
      'collapsed'
    );
    expect(screen.getByRole('button', { name: 'Expandir sidebar' })).toBeInTheDocument();
  });

  it('inicia recolhida no tablet sem sobrescrever uma preferência explícita', () => {
    mockViewport({ tablet: true });
    const first = renderShell();
    expect(document.querySelector('.trace-shell')).toHaveAttribute(
      'data-sidebar-state',
      'collapsed'
    );
    first.unmount();

    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, 'false');
    renderShell();
    expect(document.querySelector('.trace-shell')).toHaveAttribute(
      'data-sidebar-state',
      'expanded'
    );
  });

  it('ignora preferência inválida da sidebar e usa o padrão seguro do viewport', () => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, 'talvez');
    renderShell();
    expect(document.querySelector('.trace-shell')).toHaveAttribute(
      'data-sidebar-state',
      'expanded'
    );
  });

  it('abre o drawer mobile com foco interno e fecha por Escape retornando o foco', async () => {
    mockViewport({ mobile: true });
    const interaction = userEvent.setup();
    renderShell();
    const trigger = document.querySelector('[aria-label="Abrir navegação"]');
    fireEvent.click(trigger);

    expect(document.querySelector('.trace-shell')).toHaveAttribute('data-drawer-state', 'open');
    expect(document.querySelector('.trace-shell__mobile-close')).toHaveFocus();
    expect(
      screen.getByRole('button', { name: 'Conteúdo da página' }).closest('.trace-shell__main')
    ).toHaveProperty('inert', true);

    await interaction.keyboard('{Escape}');
    expect(document.querySelector('.trace-shell')).toHaveAttribute('data-drawer-state', 'closed');
    expect(trigger).toHaveFocus();
  });

  it('ordena fixados e recentes, marca o projeto ativo e filtra IDs sem acesso', async () => {
    const keys = quickProjectStorageKeys(user.id);
    window.localStorage.setItem(keys.pinned, JSON.stringify(['2']));
    window.localStorage.setItem(keys.recent, JSON.stringify(['3', '999', '1']));
    renderShell({ route: '/projects/1/tasks' });
    const navigation = screen.getByRole('navigation', { name: 'Projetos rápidos' });

    await waitFor(() => {
      expect(JSON.parse(window.localStorage.getItem(keys.recent))).toEqual(['1', '3']);
    });
    const links = within(navigation).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('aria-label'))).toEqual([
      'Abrir projeto Beta',
      'Abrir projeto Alpha',
      'Abrir projeto Gamma'
    ]);
    expect(within(navigation).getByRole('link', { name: 'Abrir projeto Alpha' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(within(navigation).queryByText('999')).not.toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(keys.recent))).toEqual(['1', '3']);
  });

  it('fixa e desafixa um projeto com preferência persistida', async () => {
    const keys = quickProjectStorageKeys(user.id);
    window.localStorage.setItem(keys.recent, JSON.stringify(['1']));
    const interaction = userEvent.setup();
    renderShell();
    await interaction.click(await screen.findByRole('button', { name: 'Fixar projeto Alpha' }));
    expect(window.localStorage.getItem(keys.pinned)).toBe('["1"]');
    await interaction.click(screen.getByRole('button', { name: 'Desafixar projeto Alpha' }));
    expect(window.localStorage.getItem(keys.pinned)).toBe('[]');
  });

  it('mantém cinco pins ao recusar o sexto e apresenta feedback discreto', async () => {
    const keys = quickProjectStorageKeys(user.id);
    window.localStorage.setItem(keys.pinned, JSON.stringify(['1', '2', '3', '4', '5']));
    const interaction = userEvent.setup();
    render(<PinLimitProbe />);
    await interaction.click(screen.getByRole('button', { name: 'Fixar sexto' }));
    expect(screen.getByText('Você pode fixar no máximo 5 projetos.')).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(keys.pinned))).toEqual(['1', '2', '3', '4', '5']);
  });

  it('reutiliza o logout autenticado e mantém identidade sem menu oculto', async () => {
    const onLogout = vi.fn().mockResolvedValue();
    const interaction = userEvent.setup();
    renderShell({ onLogout });
    expect(screen.getByLabelText('Usuário Daniel Ganz Musse')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Abrir menu de/)).not.toBeInTheDocument();
    await interaction.click(screen.getByRole('button', { name: 'Sair' }));
    expect(onLogout).toHaveBeenCalledOnce();
  });

  it('mantém a navegação principal quando a lista de projetos falha', async () => {
    const keys = quickProjectStorageKeys(user.id);
    window.localStorage.setItem(keys.pinned, JSON.stringify(['1']));
    mocks.list.mockRejectedValueOnce({ response: { data: { message: 'Falha artificial' } } });
    renderShell();
    expect(await screen.findByText('Projetos rápidos indisponíveis.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Projetos' })).toHaveAttribute('href', '/projects');
    expect(
      screen.getByRole('button', { name: 'Tema atual: Sistema. Alterar para Claro.' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument();
    expect(window.localStorage.getItem(keys.pinned)).toBe('["1"]');
  });

  it('expõe o estado e a próxima ação no ciclo Sistema → Claro → Escuro → Sistema', async () => {
    const interaction = userEvent.setup();
    renderShell();

    await interaction.click(
      screen.getByRole('button', { name: 'Tema atual: Sistema. Alterar para Claro.' })
    );
    await interaction.click(
      screen.getByRole('button', { name: 'Tema atual: Claro. Alterar para Escuro.' })
    );
    await interaction.click(
      screen.getByRole('button', { name: 'Tema atual: Escuro. Alterar para Sistema.' })
    );

    expect(
      screen.getByRole('button', { name: 'Tema atual: Sistema. Alterar para Claro.' })
    ).toHaveAttribute('data-tooltip', 'Tema: Sistema');
    expect(window.localStorage.getItem('traceflow.theme')).toBe('system');
  });
});
