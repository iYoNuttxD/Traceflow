import { NavLink, Outlet } from 'react-router';
import '../../shared/styles/internal-tabs.css';
import './SettingsLayout.css';
import './styles/settings-shared.css';

const sections = [
  ['/settings/account', 'Conta'],
  ['/settings/security', 'Segurança'],
  ['/settings/privacy', 'Privacidade'],
  ['/settings/integrations', 'Integrações'],
  ['/settings/notifications', 'Notificações']
];

export function SettingsLayout() {
  return (
    <main className="page-container settings-shell">
      <header className="settings-header">
        <p className="eyebrow">Configurações</p>
        <h1>Configurações</h1>
        <p>Gerencie sua conta, segurança, privacidade, integrações e notificações.</p>
      </header>
      <nav className="internal-tabs settings-tabs" aria-label="Configurações da conta">
        {sections.map(([to, label]) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `internal-tab settings-tab${isActive ? ' internal-tab--active' : ''}`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="settings-content">
        <Outlet />
      </div>
    </main>
  );
}
