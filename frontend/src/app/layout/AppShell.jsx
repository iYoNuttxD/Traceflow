import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { useProjectsCatalog } from '../../features/projects/index.js';
import { useTheme } from '../theme/ThemeProvider.jsx';
import {
  MOBILE_QUERY,
  TABLET_QUERY,
  persistSidebarPreference,
  readSidebarPreference
} from './sidebar-preference.js';
import { useQuickProjects } from './useQuickProjects.js';
import './AppShell.css';

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = (event) => setMatches(event.matches);
    setMatches(media.matches);
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, [query]);

  return matches;
}

function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

function projectMonogram(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

function activeProjectFromPath(pathname) {
  const match = pathname.match(/^\/projects\/([^/]+)/);
  return match?.[1] || null;
}

function ShellIcon({ name }) {
  const content = {
    chevron: <path d="m15 18-6-6 6-6" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    logout: (
      <>
        <path d="M10 17l5-5-5-5M15 12H3" />
        <path d="M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
      </>
    ),
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    moon: <path d="M20 15.2A8.5 8.5 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2Z" />,
    pin: (
      <>
        <path d="m14 4 6 6-3 1-4 4-1 5-2-2-4-4-2-2 5-1 4-4Z" />
        <path d="m9 15-5 5" />
      </>
    ),
    projects: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="2" />
        <rect x="14" y="3" width="7" height="7" rx="2" />
        <rect x="3" y="14" width="7" height="7" rx="2" />
        <rect x="14" y="14" width="7" height="7" rx="2" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 7h-6V1" />
        <path d="M20 7a9 9 0 1 0 1 8" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3A1.7 1.7 0 0 0 14 21v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14h-.2v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
      </>
    ),
    system: (
      <>
        <rect x="3" y="4" width="18" height="14" rx="2" />
        <path d="M8 22h8M12 18v4" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </>
    )
  }[name];

  return (
    <svg className="trace-shell__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {content}
    </svg>
  );
}

function TraceflowMark() {
  return (
    <svg
      className="trace-shell__brand-mark"
      viewBox="0 0 40 40"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="13" cy="12" r="4" />
      <circle cx="27" cy="28" r="4" />
      <path d="m16 15 8 10" />
    </svg>
  );
}

export function AppShell({ user, onLogout, children }) {
  const location = useLocation();
  const { themePreference, cycleTheme } = useTheme();
  const {
    projects,
    loading: projectsLoading,
    error: projectsError,
    refreshProjects
  } = useProjectsCatalog();
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const isTablet = useMediaQuery(TABLET_QUERY);
  const initialPreferenceRef = useRef(readSidebarPreference());
  const [hasSidebarPreference, setHasSidebarPreference] = useState(
    initialPreferenceRef.current !== null
  );
  const [collapsed, setCollapsed] = useState(
    initialPreferenceRef.current ?? (!isMobile && isTablet)
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const sidebarRef = useRef(null);
  const closeButtonRef = useRef(null);
  const menuButtonRef = useRef(null);
  const mainRef = useRef(null);
  const contentRef = useRef(null);
  const previousPathRef = useRef(location.pathname);
  const activeProjectId = activeProjectFromPath(location.pathname);
  const { quickProjects, feedback, togglePinned } = useQuickProjects({
    projects,
    userId: user?.id,
    activeProjectId,
    catalogLoading: projectsLoading,
    catalogError: projectsError
  });

  useEffect(() => {
    if (hasSidebarPreference || isMobile) return;
    setCollapsed(isTablet);
  }, [hasSidebarPreference, isMobile, isTablet]);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  useEffect(() => {
    if (!isMobile) setDrawerOpen(false);
  }, [isMobile]);

  useEffect(() => {
    if (previousPathRef.current !== location.pathname) {
      previousPathRef.current = location.pathname;
      if (drawerOpen) closeDrawer();
    }
  }, [closeDrawer, drawerOpen, location.pathname]);

  useEffect(() => {
    if (!isMobile || !drawerOpen) return undefined;
    const main = mainRef.current;
    const sidebar = sidebarRef.current;
    const menuButton = menuButtonRef.current;
    const previousOverflow = document.body.style.overflow;
    if (main) main.inert = true;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDrawer();
        return;
      }
      if (event.key !== 'Tab' || !sidebar) return;
      const focusable = [...sidebar.querySelectorAll(focusableSelector)].filter(
        (element) =>
          !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (main) main.inert = false;
      menuButton?.focus();
    };
  }, [closeDrawer, drawerOpen, isMobile]);

  const toggleSidebar = () => {
    const next = !collapsed;
    setCollapsed(next);
    setHasSidebarPreference(true);
    persistSidebarPreference(next);
  };

  const themeControl = {
    system: { label: 'Sistema', nextLabel: 'Claro', icon: 'system' },
    light: { label: 'Claro', nextLabel: 'Escuro', icon: 'sun' },
    dark: { label: 'Escuro', nextLabel: 'Sistema', icon: 'moon' }
  }[themePreference];
  const sidebarState = collapsed ? 'collapsed' : 'expanded';

  return (
    <div
      className="trace-shell"
      data-sidebar-state={sidebarState}
      data-drawer-state={drawerOpen ? 'open' : 'closed'}
    >
      <a
        className="trace-shell__skip-link"
        href="#main-content"
        onClick={() => contentRef.current?.focus()}
      >
        Pular para o conteúdo
      </a>
      <aside
        ref={sidebarRef}
        id="traceflow-global-navigation"
        className="trace-shell__sidebar"
        aria-label="Navegação global"
        aria-hidden={isMobile && !drawerOpen ? 'true' : undefined}
        aria-modal={isMobile && drawerOpen ? 'true' : undefined}
        role={isMobile && drawerOpen ? 'dialog' : undefined}
      >
        <header className="trace-shell__sidebar-header">
          <Link
            className="trace-shell__brand"
            to="/projects"
            aria-label="TRACEFLOW — Projetos"
            data-tooltip="TRACEFLOW"
          >
            <TraceflowMark />
            <span className="trace-shell__brand-label">TRACEFLOW</span>
          </Link>
          <button
            className="trace-shell__icon-button trace-shell__collapse"
            type="button"
            onClick={toggleSidebar}
            aria-label={collapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
            aria-expanded={!collapsed}
            data-tooltip={collapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
          >
            <ShellIcon name="chevron" />
          </button>
          <button
            ref={closeButtonRef}
            className="trace-shell__icon-button trace-shell__mobile-close"
            type="button"
            onClick={closeDrawer}
            aria-label="Fechar navegação"
          >
            <ShellIcon name="close" />
          </button>
        </header>

        <div className="trace-shell__sidebar-content">
          <nav className="trace-shell__section" aria-label="Principal">
            <NavLink className="trace-shell__nav-item" to="/projects" end data-tooltip="Projetos">
              <ShellIcon name="projects" />
              <span className="trace-shell__nav-label">Projetos</span>
            </NavLink>
          </nav>

          <nav className="trace-shell__section" aria-label="Projetos rápidos">
            <h2 className="trace-shell__section-title">Projetos rápidos</h2>
            {projectsLoading ? (
              <p className="trace-shell__quiet-state" role="status">
                Carregando projetos…
              </p>
            ) : projectsError ? (
              <div className="trace-shell__quiet-state" role="status">
                <span>Projetos rápidos indisponíveis.</span>
                <button
                  className="trace-shell__retry"
                  type="button"
                  onClick={() => void refreshProjects()}
                >
                  <ShellIcon name="refresh" />
                  <span className="trace-shell__nav-label">Tentar novamente</span>
                </button>
              </div>
            ) : quickProjects.length === 0 ? (
              <p className="trace-shell__quiet-state">Nenhum projeto recente.</p>
            ) : (
              <div className="trace-shell__quick-list">
                {quickProjects.map(({ project, pinned }) => {
                  const active = String(project.id) === String(activeProjectId);
                  return (
                    <div
                      className="trace-shell__quick-row"
                      data-active={active || undefined}
                      data-pinned={pinned || undefined}
                      key={project.id}
                    >
                      <Link
                        className="trace-shell__quick-link"
                        to={`/projects/${project.id}`}
                        aria-current={active ? 'page' : undefined}
                        aria-label={`Abrir projeto ${project.name}`}
                        data-tooltip={project.name}
                      >
                        <span className="trace-shell__project-mark" aria-hidden="true">
                          {projectMonogram(project.name)}
                        </span>
                        <span className="trace-shell__nav-label">{project.name}</span>
                        {pinned && (
                          <span className="trace-shell__collapsed-pin" aria-hidden="true">
                            <ShellIcon name="pin" />
                          </span>
                        )}
                      </Link>
                      <button
                        className="trace-shell__pin-button"
                        type="button"
                        onClick={() => togglePinned(project.id)}
                        aria-label={`${pinned ? 'Desafixar' : 'Fixar'} projeto ${project.name}`}
                        title={`${pinned ? 'Desafixar' : 'Fixar'} projeto ${project.name}`}
                        data-pinned={pinned || undefined}
                      >
                        <ShellIcon name="pin" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            {feedback && (
              <p className="trace-shell__pin-feedback" role="status">
                {feedback}
              </p>
            )}
          </nav>

          <div className="trace-shell__bottom">
            <button
              className="trace-shell__nav-item"
              type="button"
              onClick={cycleTheme}
              aria-label={`Tema atual: ${themeControl.label}. Alterar para ${themeControl.nextLabel}.`}
              data-tooltip={`Tema: ${themeControl.label}`}
            >
              <ShellIcon name={themeControl.icon} />
              <span className="trace-shell__theme-copy">
                <span>Tema</span>
                <small>{themeControl.label}</small>
              </span>
            </button>
            <NavLink
              className="trace-shell__nav-item"
              to="/settings/account"
              data-tooltip="Configurações"
            >
              <ShellIcon name="settings" />
              <span className="trace-shell__nav-label">Configurações</span>
            </NavLink>
            <button
              className="trace-shell__nav-item trace-shell__logout"
              type="button"
              onClick={() => void onLogout()}
              data-tooltip="Sair"
            >
              <ShellIcon name="logout" />
              <span className="trace-shell__nav-label">Sair</span>
            </button>
            <div
              className="trace-shell__user"
              aria-label={`Usuário ${user?.name || ''}`}
              data-tooltip={user?.name || 'Usuário'}
            >
              <span className="trace-shell__avatar" aria-hidden="true">
                {initials(user?.name)}
              </span>
              <span className="trace-shell__user-copy">
                <strong>{user?.name}</strong>
                {user?.email && <span>{user.email}</span>}
              </span>
            </div>
          </div>
        </div>
      </aside>

      <button
        className="trace-shell__backdrop"
        type="button"
        onClick={closeDrawer}
        aria-label="Fechar navegação"
        tabIndex={-1}
      />

      <div className="trace-shell__main" ref={mainRef}>
        <header className="trace-shell__mobile-topbar">
          <span className="trace-shell__mobile-brand">
            <TraceflowMark />
            TRACEFLOW
          </span>
          <button
            ref={menuButtonRef}
            className="trace-shell__icon-button"
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-controls="traceflow-global-navigation"
            aria-expanded={drawerOpen}
            aria-label="Abrir navegação"
          >
            <ShellIcon name="menu" />
          </button>
        </header>
        <div className="trace-shell__content" id="main-content" ref={contentRef} tabIndex={-1}>
          {children}
        </div>
      </div>
    </div>
  );
}
