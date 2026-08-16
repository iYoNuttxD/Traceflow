// Fachada compatível: mantém o export histórico enquanto delega casos de uso coesos.
import { projectCrudService } from './services/project-crud.service.js';
import { projectGithubService } from './services/project-github.service.js';
import { projectMembersService } from './services/project-members.service.js';
import { projectAccessCodeService } from './services/project-access-code.service.js';

// API pública interna do módulo: agrega os casos de uso consumidos pelo controller.
export const projectService = {
  ...projectCrudService,
  ...projectMembersService,
  ...projectAccessCodeService,
  ...projectGithubService
};
