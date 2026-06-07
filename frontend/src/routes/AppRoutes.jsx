// Rotas principais do frontend TRACEFLOW.
// TODO: Ajustar navegacao conforme os fluxos forem implementados.
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProjectsPage } from '../pages/ProjectsPage.jsx';
import { ProjectDetailsPage } from '../pages/ProjectDetailsPage.jsx';
import { RequirementsPage } from '../pages/RequirementsPage.jsx';
import { TasksPage } from '../pages/TasksPage.jsx';
import { KanbanPage } from '../pages/KanbanPage.jsx';
import { GithubArtifactsPage } from '../pages/GithubArtifactsPage.jsx';
import { TraceabilityPage } from '../pages/TraceabilityPage.jsx';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/projects" replace />} />
      <Route path="/projects" element={<ProjectsPage />} />
      <Route path="/projects/:id" element={<ProjectDetailsPage />} />
      <Route path="/projects/:id/requirements" element={<RequirementsPage />} />
      <Route path="/projects/:projectId/tasks" element={<TasksPage />} />
      <Route path="/projects/:projectId/kanban" element={<KanbanPage />} />
      <Route path="/projects/:id/github-artifacts" element={<GithubArtifactsPage />} />
      <Route path="/projects/:id/traceability" element={<TraceabilityPage />} />
    </Routes>
  );
}
