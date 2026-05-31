// Estrutura geral da aplicacao. Mantem navegacao e conteudo das paginas.
// TODO: Evoluir o layout sem antecipar telas completas.
import { Navbar } from './Navbar.jsx';

export function Layout({ children }) {
  return (
    <>
      <Navbar />
      {children}
    </>
  );
}
