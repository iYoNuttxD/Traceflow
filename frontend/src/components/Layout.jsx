// Estrutura geral da aplicacao. Mantem navegacao e conteudo das paginas.
// Shell visual global das rotas do TRACEFLOW.
import { Navbar } from './Navbar.jsx';
import { EmailVerificationBanner, UsernameSetupBanner, useAuth } from '../features/auth/index.js';
import { useLocation } from 'react-router';

export function Layout({ children }) {
  const { user, updateUser } = useAuth();
  const location = useLocation();
  const restricted =
    user &&
    (user.accountStatus || (user.isActive === false ? 'DEACTIVATED' : 'ACTIVE')) !== 'ACTIVE';
  const publicConfirmation =
    location.pathname === '/settings/account/email-change/confirm' ||
    location.pathname === '/account/reactivation/confirm';
  return (
    <>
      {!restricted && !publicConfirmation && <Navbar />}
      {!restricted && !publicConfirmation && <EmailVerificationBanner user={user} />}
      {!restricted && !publicConfirmation && (
        <UsernameSetupBanner user={user} onUpdated={updateUser} />
      )}
      {children}
    </>
  );
}
