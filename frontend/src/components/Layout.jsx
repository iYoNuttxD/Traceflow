// Estrutura geral da aplicacao. Mantem navegacao e conteudo das paginas.
// Shell visual global das rotas do TRACEFLOW.
import { Navbar } from './Navbar.jsx';
import { EmailVerificationBanner, UsernameSetupBanner, useAuth } from '../features/auth/index.js';

export function Layout({ children }) {
  const { user, updateUser } = useAuth();
  return (
    <>
      <Navbar />
      <EmailVerificationBanner user={user} />
      <UsernameSetupBanner user={user} onUpdated={updateUser} />
      {children}
    </>
  );
}
