import { Suspense } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router';
import { ProtectedRoute } from '../../features/auth/index.js';
import { LoadingState } from '../../shared/index.js';
import { lazyNamed } from './lazy-route.js';

const LoginPage = lazyNamed(() => import('../../pages/LoginPage.jsx'), 'LoginPage');
const RegisterPage = lazyNamed(() => import('../../pages/RegisterPage.jsx'), 'RegisterPage');
const ForgotPasswordPage = lazyNamed(
  () => import('../../pages/ForgotPasswordPage.jsx'),
  'ForgotPasswordPage'
);
const ResetPasswordPage = lazyNamed(
  () => import('../../pages/ResetPasswordPage.jsx'),
  'ResetPasswordPage'
);
const AcceptInvitationPage = lazyNamed(
  () => import('../../pages/AcceptInvitationPage.jsx'),
  'AcceptInvitationPage'
);
const JoinProjectPage = lazyNamed(
  () => import('../../pages/JoinProjectPage.jsx'),
  'JoinProjectPage'
);
const ProjectsPage = lazyNamed(() => import('../../pages/ProjectsPage.jsx'), 'ProjectsPage');
const ProjectDetailsPage = lazyNamed(
  () => import('../../pages/ProjectDetailsPage.jsx'),
  'ProjectDetailsPage'
);
const RequirementsPage = lazyNamed(
  () => import('../../pages/RequirementsPage.jsx'),
  'RequirementsPage'
);
const TasksPage = lazyNamed(() => import('../../pages/TasksPage.jsx'), 'TasksPage');
const KanbanPage = lazyNamed(() => import('../../pages/KanbanPage.jsx'), 'KanbanPage');
const RepositoryInfoPage = lazyNamed(
  () => import('../../pages/RepositoryInfoPage.jsx'),
  'RepositoryInfoPage'
);
const TraceabilityPage = lazyNamed(
  () => import('../../pages/TraceabilityPage.jsx'),
  'TraceabilityPage'
);
const PrivacyPage = lazyNamed(() => import('../../pages/PrivacyPage.jsx'), 'PrivacyPage');
const ProjectAuditPage = lazyNamed(
  () => import('../../pages/ProjectAuditPage.jsx'),
  'ProjectAuditPage'
);

export function RouteLoadingFallback() {
  return (
    <main className="page-container">
      <LoadingState message="Carregando página..." />
    </main>
  );
}

export function AppRoutes() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route
          element={
            <ProtectedRoute>
              <Outlet />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Navigate to="/projects" replace />} />
          <Route path="/invitations/accept" element={<AcceptInvitationPage />} />
          <Route path="/join" element={<JoinProjectPage />} />
          <Route path="/join/:accessCode" element={<JoinProjectPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:id" element={<ProjectDetailsPage />} />
          <Route path="/projects/:projectId/requirements" element={<RequirementsPage />} />
          <Route path="/projects/:projectId/tasks" element={<TasksPage />} />
          <Route path="/projects/:projectId/kanban" element={<KanbanPage />} />
          <Route path="/projects/:projectId/repository" element={<RepositoryInfoPage />} />
          <Route path="/projects/:projectId/traceability" element={<TraceabilityPage />} />
          <Route path="/account/privacy" element={<PrivacyPage />} />
          <Route path="/projects/:projectId/audit" element={<ProjectAuditPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
