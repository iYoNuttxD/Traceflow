// Navegacao principal inicial do TRACEFLOW.
// TODO: Adicionar links contextuais quando o projeto ativo estiver disponivel.
import { Link } from 'react-router-dom';

export function Navbar() {
  return (
    <nav className="navbar">
      <Link className="brand" to="/projects">TRACEFLOW</Link>
      <Link className="nav-link" to="/projects">Projetos</Link>
    </nav>
  );
}
