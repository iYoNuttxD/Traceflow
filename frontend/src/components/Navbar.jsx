// Navegacao principal inicial do TRACEFLOW.
// TODO: Adicionar links contextuais quando o projeto ativo estiver disponivel.
import { Link } from 'react-router-dom';
import { useAuth } from '../features/auth/index.js';

export function Navbar() {
  const auth = useAuth();
  return (
    <nav className="navbar">
      <Link className="brand" to="/projects">TRACEFLOW</Link>
      <Link className="nav-link" to="/projects">Projetos</Link>
      {auth?.user && <><Link className="nav-link" to="/account/privacy">Privacidade</Link><span className="nav-link">{auth.user.name}</span><button type="button" onClick={() => void auth.logout()}>Sair</button></>}
    </nav>
  );
}
