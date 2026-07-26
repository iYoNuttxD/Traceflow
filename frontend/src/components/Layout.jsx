// Estrutura geral da aplicacao. Mantem navegacao e conteudo das paginas.
// Shell visual global das rotas do TRACEFLOW.
import { Navbar } from './Navbar.jsx';

export function Layout({ children }) {
  return (
    <>
      <Navbar />
      {children}
    </>
  );
}
