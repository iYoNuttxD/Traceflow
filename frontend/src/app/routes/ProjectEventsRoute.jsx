import { useParams } from 'react-router';
import { useAuth } from '../../features/auth/index.js';
import { ProjectEventsProvider } from '../../features/projects/index.js';

export function ProjectEventsRoute({ children }) {
  const { projectId } = useParams();
  const { user } = useAuth();
  const accountStatus =
    user?.accountStatus || (user?.isActive === false ? 'DEACTIVATED' : 'ACTIVE');

  return (
    <ProjectEventsProvider
      projectId={projectId}
      enabled={Boolean(user) && accountStatus === 'ACTIVE'}
    >
      {children}
    </ProjectEventsProvider>
  );
}
