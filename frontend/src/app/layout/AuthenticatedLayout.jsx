import { Outlet } from 'react-router';
import {
  EmailVerificationBanner,
  UsernameSetupBanner,
  useAuth
} from '../../features/auth/index.js';
import { ProjectsCatalogProvider } from '../../features/projects/index.js';
import { AppShell } from './AppShell.jsx';

export function AuthenticatedLayout() {
  const { user, updateUser, logout } = useAuth();
  const status = user?.accountStatus || (user?.isActive === false ? 'DEACTIVATED' : 'ACTIVE');

  if (status !== 'ACTIVE') return <Outlet />;

  return (
    <ProjectsCatalogProvider>
      <AppShell user={user} onLogout={logout}>
        <EmailVerificationBanner user={user} />
        <UsernameSetupBanner user={user} onUpdated={updateUser} />
        <Outlet />
      </AppShell>
    </ProjectsCatalogProvider>
  );
}
