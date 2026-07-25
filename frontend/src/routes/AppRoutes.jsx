// Rotas principais do frontend TRACEFLOW.
// TODO: Ajustar navegacao conforme os fluxos forem implementados.
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { ProjectsPage } from '../pages/ProjectsPage.jsx';
import { ProjectDetailsPage } from '../pages/ProjectDetailsPage.jsx';
import { RequirementsPage } from '../pages/RequirementsPage.jsx';
import { TasksPage } from '../pages/TasksPage.jsx';
import { KanbanPage } from '../pages/KanbanPage.jsx';
import { RepositoryInfoPage } from '../pages/RepositoryInfoPage.jsx';
import { GithubArtifactsPage } from '../pages/GithubArtifactsPage.jsx';
import { TraceabilityPage } from '../pages/TraceabilityPage.jsx';
import { JoinProjectPage } from '../pages/JoinProjectPage.jsx';
import { LoginPage } from '../pages/LoginPage.jsx';
import { RegisterPage } from '../pages/RegisterPage.jsx';
import { ForgotPasswordPage } from '../pages/ForgotPasswordPage.jsx';
import { ResetPasswordPage } from '../pages/ResetPasswordPage.jsx';
import { AcceptInvitationPage } from '../pages/AcceptInvitationPage.jsx';
import { ProtectedRoute } from '../features/auth/ProtectedRoute.jsx';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route element={<ProtectedRoute><Outlet /></ProtectedRoute>}>
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
        <Route path="/projects/:id/github-artifacts" element={<GithubArtifactsPage />} />
        <Route path="/projects/:projectId/traceability" element={<TraceabilityPage />} />
      </Route>
    </Routes>
  );
}
