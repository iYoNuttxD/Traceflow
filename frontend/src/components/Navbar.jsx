// Navegacao principal inicial do TRACEFLOW.
// TODO: Adicionar links contextuais quando o projeto ativo estiver disponivel.
import { Link } from 'react-router-dom';

export function Navbar() {
  return (
    <nav>
      <strong>TRACEFLOW</strong>
      <Link to="/projects">Projetos</Link>
    </nav>
  );
}
