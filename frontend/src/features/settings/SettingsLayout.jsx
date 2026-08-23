import { NavLink, Outlet } from 'react-router';

const sections = [
  ['/settings/account', 'Conta'],
  ['/settings/security', 'Segurança'],
  ['/settings/privacy', 'Privacidade'],
  ['/settings/integrations', 'Integrações']
];

export function SettingsLayout() {
  return (
    <main className="page-container settings-shell">
      <header>
        <p className="eyebrow">Preferências pessoais</p>
        <h1>Configurações</h1>
        <p>Gerencie sua identidade, segurança, privacidade e autorizações externas.</p>
      </header>
      <div className="settings-grid">
        <nav className="settings-nav" aria-label="Configurações da conta">
          {sections.map(([to, label]) => (
            <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'active' : '')}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="settings-content">
          <Outlet />
        </div>
      </div>
    </main>
  );
}
