import { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router';
import { GuestOnlyRoute, ProtectedRoute } from '../../features/auth/index.js';
import { ContextualErrorPage, LoadingState, PAGE_ERROR_TYPES } from '../../shared/index.js';
import { AuthenticatedLayout } from '../layout/AuthenticatedLayout.jsx';
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
const VerifyEmailPage = lazyNamed(
  () => import('../../pages/VerifyEmailPage.jsx'),
  'VerifyEmailPage'
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
const ProjectAuditPage = lazyNamed(
  () => import('../../pages/ProjectAuditPage.jsx'),
  'ProjectAuditPage'
);
const SettingsLayout = lazyNamed(
  () => import('../../features/settings/SettingsLayout.jsx'),
  'SettingsLayout'
);
const AccountSettingsPage = lazyNamed(
  () => import('../../features/settings/AccountSettingsPage.jsx'),
  'AccountSettingsPage'
);
const SecuritySettingsPage = lazyNamed(
  () => import('../../features/settings/SecuritySettingsPage.jsx'),
  'SecuritySettingsPage'
);
const PrivacySettingsPage = lazyNamed(
  () => import('../../features/settings/PrivacySettingsPage.jsx'),
  'PrivacySettingsPage'
);
const IntegrationsSettingsPage = lazyNamed(
  () => import('../../features/settings/IntegrationsSettingsPage.jsx'),
  'IntegrationsSettingsPage'
);
const ConfirmationPage = lazyNamed(
  () => import('../../features/settings/ConfirmationPage.jsx'),
  'ConfirmationPage'
);
const RestrictedAccountPage = lazyNamed(
  () => import('../../features/settings/RestrictedAccountPage.jsx'),
  'RestrictedAccountPage'
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
        <Route
          path="/login"
          element={
            <GuestOnlyRoute>
              <LoginPage />
            </GuestOnlyRoute>
          }
        />
        <Route
          path="/register"
          element={
            <GuestOnlyRoute>
              <RegisterPage />
            </GuestOnlyRoute>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <GuestOnlyRoute>
              <ForgotPasswordPage />
            </GuestOnlyRoute>
          }
        />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route
          path="/settings/account/email-change/confirm"
          element={<ConfirmationPage type="email" />}
        />
        <Route
          path="/account/reactivation/confirm"
          element={<ConfirmationPage type="reactivation" />}
        />
        <Route
          element={
            <ProtectedRoute>
              <AuthenticatedLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Navigate to="/projects" replace />} />
          <Route path="/restricted" element={<RestrictedAccountPage />} />
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
          <Route path="/settings" element={<SettingsLayout />}>
            <Route index element={<Navigate to="account" replace />} />
            <Route path="account" element={<AccountSettingsPage />} />
            <Route path="security" element={<SecuritySettingsPage />} />
            <Route path="privacy" element={<PrivacySettingsPage />} />
            <Route path="integrations" element={<IntegrationsSettingsPage />} />
          </Route>
          <Route path="/projects/:projectId/audit" element={<ProjectAuditPage />} />
        </Route>
        <Route
          path="*"
          element={<ContextualErrorPage type={PAGE_ERROR_TYPES.NOT_FOUND} showRetry={false} />}
        />
      </Routes>
    </Suspense>
  );
}
