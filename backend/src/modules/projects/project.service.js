// Fachada compatível: mantém o export histórico enquanto delega casos de uso coesos.
import { projectCrudService } from './services/project-crud.service.js';
import { projectGithubService } from './services/project-github.service.js';
import { projectMembersService } from './services/project-members.service.js';

// TODO(E2.9): remover a fachada quando todos os consumidores usarem os casos de uso públicos.
export const projectService = {
  ...projectCrudService,
  ...projectMembersService,
  ...projectGithubService
};
