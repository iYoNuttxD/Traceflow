import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { useEffect, useState } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  listNotifications: vi.fn(),
  getUnreadNotificationCount: vi.fn(),
  markNotification: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  getNotificationPreferences: vi.fn(),
  saveNotificationPreferences: vi.fn()
}));
const projects = vi.hoisted(() => ({ list: vi.fn() }));
const USER = vi.hoisted(() => ({
  id: 7,
  name: 'Ana Souza',
  email: 'ana@example.invalid',
  accountStatus: 'ACTIVE',
  emailVerifiedAt: '2026-10-01T12:00:00.000Z'
}));
vi.mock('../../../src/features/notifications/api/notifications.api.js', () => api);
vi.mock('../../../src/features/projects/api/projects.api.js', () => ({
  projectsApi: { list: projects.list }
}));
vi.mock('../../../src/features/auth/AuthContext.jsx', () => ({
  useAuth: () => ({
    user: USER,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    updateUser: vi.fn(),
    refresh: vi.fn()
  })
}));

const { AppShell } = await import('../../../src/app/layout/AppShell.jsx');
const { ThemeProvider } = await import('../../../src/app/theme/ThemeProvider.jsx');
const { ProjectsCatalogProvider } = await import('../../../src/features/projects/index.js');
const { UnreadNotificationsProvider } =
  await import('../../../src/features/notifications/index.js');
const { useDialogLayer } = await import('../../../src/shared/components/dialog-stack.js');

const CREATED = '2026-10-15T14:30:00.000Z';
const PANEL_CSS = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../src/features/notifications/components/NotificationsPanel.css'
);
const PREFERENCES = Object.freeze({
  TASK_STATUS_CHANGED: true,
  TASK_OVERDUE: true,
  ISSUE_EVENT: true,
  PULL_REQUEST_EVENT: true,
  TRACEABILITY_INCONSISTENCY: true
});

function notification(id, overrides = {}) {
  return {
    id,
    type: 'TASK_STATUS_CHANGED',
    createdAt: CREATED,
    readAt: null,
    project: { id: 9, name: 'Projeto Alfa' },
    task: { id: 100 + id, code: `TASK-${100 + id}`, title: `Tarefa ${id}`, available: true },
    context: {
      fromStatus: 'EM_ANDAMENTO',
      toStatus: 'CONCLUIDO',
      actor: { id: 3, name: 'Bruno Lima' },
      selfAction: false
    },
    link: `/projects/9/kanban?task=${100 + id}`,
    ...overrides
  };
}

function listing(items, { total = items.length, nextCursor = null, unreadCount } = {}) {
  return {
    notifications: items,
    pagination: { page: 1, limit: 20, total, totalPages: Math.ceil(total / 20) },
    unreadCount: unreadCount ?? items.filter((item) => !item.readAt).length,
    nextCursor
  };
}

function mockViewport({ mobile = false } = {}) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: query === '(max-width: 720px)' && mobile,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }));
}

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="Destino">{`${location.pathname}${location.search}`}</output>;
}

function StackedLayer({ onClose }) {
  const isTop = useDialogLayer(true);
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key !== 'Escape' || !isTop()) return;
      event.preventDefault();
      onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isTop, onClose]);
  return <div role="dialog" aria-label="Diálogo empilhado" />;
}
function StackedHost() {
  const [open, setOpen] = useState(false);
  return open ? <StackedLayer onClose={() => setOpen(false)} /> : null;
}

function renderShell({ route = '/projects' } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <ThemeProvider>
        <ProjectsCatalogProvider>
          <UnreadNotificationsProvider>
            <AppShell user={USER} onLogout={vi.fn()}>
              <Routes>
                <Route path="/projects" element={<p>Página de projetos</p>} />
                <Route path="/projects/:projectId/kanban" element={<LocationProbe />} />
                <Route path="/settings/notifications" element={<LocationProbe />} />
              </Routes>
            </AppShell>
            <StackedHost />
          </UnreadNotificationsProvider>
        </ProjectsCatalogProvider>
      </ThemeProvider>
    </MemoryRouter>
  );
}

const panel = () => screen.getByRole('dialog', { name: 'Notificações' });
const bell = () => screen.getAllByRole('button', { name: /^Notificações/ })[0];

async function openPanel(user) {
  await user.click(bell());
  await screen.findByRole('dialog', { name: 'Notificações' });
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  mockViewport();
  projects.list.mockResolvedValue({ data: { projects: [] } });
  api.getUnreadNotificationCount.mockResolvedValue({ unreadCount: 2 });
  api.listNotifications.mockResolvedValue(listing([notification(1), notification(2)]));
  api.markNotification.mockImplementation(async (id, read) => ({
    notification: notification(id, { readAt: read ? CREATED : null })
  }));
  api.getNotificationPreferences.mockResolvedValue({ preferences: { ...PREFERENCES } });
  api.saveNotificationPreferences.mockImplementation(async (preferences) => ({ preferences }));
});

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const focusables = () =>
  [...panel().querySelectorAll(FOCUSABLE)].filter(
    (element) => element.getAttribute('aria-hidden') !== 'true'
  );

describe('TF-REV-011 — contenção de foco do painel a partir do título', () => {
  it('P-01 Shift+Tab com o foco inicial no título vai ao último controle do painel', async () => {
    const user = userEvent.setup();
    renderShell();
    await openPanel(user);
    await screen.findAllByRole('button', { name: /^Marcar como lida/ });

    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Notificações' }));
    await user.tab({ shift: true });

    expect(panel().contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(focusables().at(-1));
  });

  it('P-02 Tab no último controle volta ao primeiro', async () => {
    const user = userEvent.setup();
    renderShell();
    await openPanel(user);
    focusables().at(-1).focus();

    await user.tab();

    expect(document.activeElement).toBe(focusables()[0]);
  });

  it('P-03 Escape fecha o painel e devolve o foco ao sino', async () => {
    const user = userEvent.setup();
    renderShell();
    await openPanel(user);

    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Notificações' })).not.toBeInTheDocument()
    );
    expect(document.activeElement).toBe(bell());
  });
});

const preferencesDialog = () => screen.getByRole('dialog', { name: 'Preferências' });

describe('UX-R2-04 — painel pela esquerda e preferências no painel', () => {
  it('P-04 o painel abre colado à navegação lateral, expandida ou recolhida, e ocupa a tela no celular', async () => {
    const user = userEvent.setup();
    renderShell();
    await openPanel(user);

    expect(panel().closest('.notifications-panel-layer')).toHaveAttribute(
      'data-sidebar-state',
      'expanded'
    );
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Recolher sidebar' }));
    await openPanel(user);
    expect(panel().closest('.notifications-panel-layer')).toHaveAttribute(
      'data-sidebar-state',
      'collapsed'
    );

    const css = readFileSync(PANEL_CSS, 'utf8');
    const block = css.match(/\.notifications-panel \{[^}]*\}/)[0];
    const layer = css.match(/\.notifications-panel-layer \{[^}]*\}/)[0];
    expect(block).toMatch(/left: var\(--notifications-panel-offset\);/);
    expect(block).not.toMatch(/right: 0/);
    expect(layer).toMatch(/--notifications-panel-offset: var\(--layout-sidebar-expanded\);/);
    expect(css).toMatch(
      /\.notifications-panel-layer\[data-sidebar-state='collapsed'\] \{\s*--notifications-panel-offset: var\(--layout-sidebar-collapsed\);/
    );
    expect(css).toMatch(/@media \(max-width: 720px\) \{[^@]*--notifications-panel-offset: 0px;/);
  });

  it('P-05 as preferências abrem dentro do painel e a volta preserva aba, origem e páginas carregadas', async () => {
    const user = userEvent.setup();
    renderShell();
    await openPanel(user);
    await user.click(screen.getByRole('tab', { name: 'Todas' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Origem' }), 'TASKS');
    await screen.findAllByRole('button', { name: /^Marcar como lida/ });
    const listings = api.listNotifications.mock.calls.length;

    await user.click(screen.getByRole('button', { name: 'Preferências de notificação' }));

    expect(preferencesDialog()).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Preferências' }));
    const issues = await within(preferencesDialog()).findByRole('checkbox', {
      name: /Issues vinculadas/
    });
    expect(screen.queryByLabelText('Destino')).toBeNull();
    await user.click(issues);
    await user.click(screen.getByRole('button', { name: 'Salvar preferências' }));
    expect(api.saveNotificationPreferences).toHaveBeenCalledWith({
      ...PREFERENCES,
      ISSUE_EVENT: false
    });
    expect(await screen.findByText('Preferências salvas.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Voltar às notificações' }));

    expect(panel()).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Todas' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('combobox', { name: 'Origem' })).toHaveValue('TASKS');
    expect(screen.getAllByRole('button', { name: /^Marcar como lida/ })).toHaveLength(2);
    expect(api.listNotifications.mock.calls.length).toBe(listings);
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Preferências de notificação' })
    );
  });

  it('P-06 o que foi marcado como lido ou não lido continua assim depois das preferências', async () => {
    const user = userEvent.setup();
    renderShell();
    await openPanel(user);
    const [first] = await screen.findAllByRole('button', { name: /^Marcar como lida/ });

    await user.click(first);
    await screen.findByRole('button', { name: /^Marcar como não lida/ });
    await user.click(screen.getByRole('button', { name: 'Preferências de notificação' }));
    await within(preferencesDialog()).findByRole('checkbox', { name: /Issues vinculadas/ });
    await user.click(screen.getByRole('button', { name: 'Voltar às notificações' }));

    expect(screen.getAllByRole('button', { name: /^Marcar como não lida/ })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /^Marcar como lida/ })).toHaveLength(1);
  });

  it('P-07 o estado vazio tem um ícone discreto com a mensagem curta, nas duas abas', async () => {
    api.getUnreadNotificationCount.mockResolvedValue({ unreadCount: 0 });
    api.listNotifications.mockResolvedValue(listing([]));
    const user = userEvent.setup();
    renderShell();
    await openPanel(user);

    const unread = await within(panel()).findByRole('heading', {
      name: 'Nenhuma notificação não lida.'
    });
    const icon = unread.closest('.notifications-panel__empty').querySelector('svg');
    expect(icon).toHaveAttribute('aria-hidden', 'true');

    await user.click(screen.getByRole('tab', { name: 'Todas' }));
    const all = await within(panel()).findByRole('heading', {
      name: 'Nenhuma notificação recebida.'
    });
    expect(all.closest('.notifications-panel__empty').querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
  });
});

describe('UX-R3-01 — o painel escurece só a área principal', () => {
  const layer = () => panel().closest('.notifications-panel-layer');
  const panelCss = () => readFileSync(PANEL_CSS, 'utf8');
  const escaped = (text) => text.replace(/[.()[\]]/g, (character) => `\\${character}`);
  const ruleOf = (selector) =>
    panelCss().match(new RegExp(`\\n${escaped(selector)} \\{[^}]*\\}`))?.[0] ?? '';

  it.each(['expanded', 'collapsed'])(
    'o botão visível não atravessa o modal (%s) e volta a funcionar pelo teclado ao fechar',
    async (state) => {
      const user = userEvent.setup();
      renderShell();
      if (state === 'collapsed')
        await user.click(screen.getByRole('button', { name: 'Recolher sidebar' }));
      const shell = document.querySelector('.trace-shell');
      const toggle = screen.getByRole('button', {
        name: state === 'collapsed' ? 'Expandir sidebar' : 'Recolher sidebar'
      });
      await openPanel(user);
      expect(panel()).toHaveAttribute('aria-modal', 'true');
      expect(shell.inert).toBe(true);
      expect(shell).toHaveAttribute('data-notifications-state', 'open');
      expect(panel().contains(toggle)).toBe(false);
      await user.tab({ shift: true });
      expect(panel().contains(document.activeElement)).toBe(true);

      // The transparent modal shield owns clicks over the background toggle.
      await user.click(layer().querySelector('.notifications-panel__menu-shield'));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(shell).toHaveAttribute('data-sidebar-state', state);
      expect(shell.inert).toBe(false);
      expect(shell).toHaveAttribute('data-notifications-state', 'closed');
      expect(document.activeElement).toBe(bell());

      toggle.focus();
      await user.keyboard('{Enter}');
      expect(shell).toHaveAttribute(
        'data-sidebar-state',
        state === 'collapsed' ? 'expanded' : 'collapsed'
      );
      await user.keyboard(' ');
      expect(shell).toHaveAttribute('data-sidebar-state', state);
      await openPanel(user);
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(document.activeElement).toBe(bell());
    }
  );

  it('M-01 o fundo começa no deslocamento do menu expandido, e o menu fica sem escurecer', async () => {
    const user = userEvent.setup();
    renderShell();
    await openPanel(user);

    expect(layer()).toHaveAttribute('data-sidebar-state', 'expanded');
    expect(panelCss().match(/^\.notifications-panel-layer \{[^}]*\}/)[0]).toMatch(
      /--notifications-panel-offset: var\(--layout-sidebar-expanded\);/
    );
    expect(ruleOf('.notifications-panel__backdrop')).toMatch(
      /inset: 0 0 0 var\(--notifications-panel-offset\);/
    );
    const shield = ruleOf('.notifications-panel__menu-shield');
    expect(shield).toMatch(/left: 0;[\s\S]*width: var\(--notifications-panel-offset\);/);
    expect(shield).not.toMatch(/background/);
    expect(layer().querySelector('.notifications-panel__menu-shield')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
  });

  it('M-02 com o menu recolhido, o fundo começa no deslocamento do menu recolhido', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.click(screen.getByRole('button', { name: 'Recolher sidebar' }));
    await openPanel(user);

    expect(layer()).toHaveAttribute('data-sidebar-state', 'collapsed');
    expect(ruleOf(".notifications-panel-layer[data-sidebar-state='collapsed']")).toMatch(
      /--notifications-panel-offset: var\(--layout-sidebar-collapsed\);/
    );
  });

  it('M-03 o diálogo continua modal: aria-modal, shell inerte e foco preso', async () => {
    const user = userEvent.setup();
    renderShell();
    await openPanel(user);
    const shell = document.querySelector('.trace-shell');

    expect(panel()).toHaveAttribute('aria-modal', 'true');
    expect(shell.inert).toBe(true);
    expect(shell.contains(panel())).toBe(false);
    focusables().at(-1).focus();
    await user.tab();
    expect(document.activeElement).toBe(focusables()[0]);
  });

  it('M-04 o clique sobre o menu fecha o painel sem navegar e devolve o foco ao sino', async () => {
    const user = userEvent.setup();
    renderShell();
    await openPanel(user);

    await user.click(layer().querySelector('.notifications-panel__menu-shield'));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Notificações' })).not.toBeInTheDocument()
    );
    expect(document.activeElement).toBe(bell());
    expect(screen.getByText('Página de projetos')).toBeInTheDocument();
    expect(document.querySelector('.trace-shell').inert).toBe(false);
  });

  it('M-05 o sino fica com aria-expanded="true" enquanto o painel está aberto', async () => {
    const user = userEvent.setup();
    renderShell();

    expect(bell()).toHaveAttribute('aria-expanded', 'false');
    await openPanel(user);
    expect(bell()).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(bell()).toHaveAttribute('aria-expanded', 'false'));
  });

  it('M-06 no celular o deslocamento é zero: o fundo cobre a tela e a faixa do menu some', () => {
    const mobile = panelCss().match(/@media \(max-width: 720px\) \{([\s\S]*?)\n\}/)[1];

    expect(mobile).toMatch(
      /\.notifications-panel-layer,\s*\.notifications-panel-layer\[data-sidebar-state='collapsed'\] \{\s*--notifications-panel-offset: 0px;\s*\}/
    );
    expect(mobile).toMatch(/\.notifications-panel \{\s*border-right: 0;\s*\}/);
  });
});
