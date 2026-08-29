// Navegacao principal inicial do TRACEFLOW.
// Navegação global; a navegação contextual de projeto fica em ProjectSectionNav.
import { Link } from 'react-router';
import { useAuth } from '../features/auth/index.js';
import './Navbar.css';

function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

export function Navbar() {
  const auth = useAuth();
  return (
    <nav className="navbar">
      <Link className="brand" to="/projects">
        TRACEFLOW
      </Link>
      <Link className="nav-link" to="/projects">
        Projetos
      </Link>
      {auth?.user && (
        <details className="user-menu">
          <summary aria-label={`Abrir menu de ${auth.user.name}`}>
            <span className="user-avatar" aria-hidden="true">
              {initials(auth.user.name)}
            </span>
            <span>{auth.user.name}</span>
          </summary>
          <div className="user-menu-panel">
            <span className="user-menu-email">{auth.user.email}</span>
            <Link to="/settings/account">Configurações</Link>
            <Link to="/settings/security">Segurança</Link>
            <Link to="/settings/privacy">Privacidade</Link>
            <Link to="/settings/integrations">Integrações</Link>
            <button type="button" onClick={() => void auth.logout()}>
              Sair
            </button>
          </div>
        </details>
      )}
    </nav>
  );
}
