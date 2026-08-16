import { asyncHandler } from '../../shared/http/index.js';
import { projectService } from './project.service.js';
import { auditService } from '../audit/audit.service.js';
import { publicProject } from './project.schema.js';

const projectFallback = 'Erro interno ao processar projeto.';
const membersFallback = 'Erro interno ao processar membros do projeto.';

export const projectController = {
  create: asyncHandler(
    async (req, res) => {
      const project = await projectService.createProject(req.body, req.auth.user.id);
      await auditService.recordOperational({
        actorUserId: req.auth.user.id,
        projectId: project.id,
        requestId: req.requestId,
        action: 'PROJECT_CREATED',
        resourceType: 'Project',
        resourceId: project.id
      });
      return res
        .status(201)
        .json({ message: 'Projeto cadastrado com sucesso.', project: publicProject(project) });
    },
    { fallbackMessage: projectFallback }
  ),

  findAll: asyncHandler(
    async (req, res) => {
      const projects = await projectService.findAllProjects(req.auth.user.id);
      return res.json({ projects: projects.map(publicProject) });
    },
    { fallbackMessage: projectFallback }
  ),

  findById: asyncHandler(
    async (req, res) => {
      const project = await projectService.getProjectById(req.params.id);
      return res.json({ project: publicProject(project) });
    },
    { fallbackMessage: projectFallback }
  ),

  addMember: asyncHandler(
    async (req, res) => {
      const member = await projectService.addProjectMember(req.params.projectId, req.body);
      return res.status(201).json({
        message: 'Membro adicionado ao projeto com sucesso.',
        member
      });
    },
    { fallbackMessage: membersFallback }
  ),

  join: asyncHandler(
    async (req, res) => {
      const result = await projectService.join(req.body.accessCode, req.auth.user, req.requestId);
      return res.status(201).json({
        message: 'Entrada no projeto realizada com sucesso.',
        project: result.project,
        membership: result.membership
      });
    },
    { fallbackMessage: 'Erro interno ao entrar no projeto.' }
  ),

  update: asyncHandler(
    async (req, res) => {
      const project = await projectService.updateProject(req.params.id, req.body);
      await auditService.recordOperational({
        actorUserId: req.auth.user.id,
        projectId: project.id,
        requestId: req.requestId,
        action: 'PROJECT_UPDATED',
        resourceType: 'Project',
        resourceId: project.id
      });
      return res.json({
        message: 'Projeto atualizado com sucesso.',
        project: publicProject(project)
      });
    },
    { fallbackMessage: projectFallback }
  ),

  createFromGithub: asyncHandler(
    async (req, res) => {
      const project = await projectService.createProjectFromGithubRepository(
        req.body,
        req.auth.user.id
      );
      return res.status(201).json({
        message: 'Projeto criado a partir do repositório GitHub com sucesso.',
        project: publicProject(project)
      });
    },
    { fallbackMessage: 'Não foi possível criar o projeto a partir do GitHub.' }
  ),

  updateGithubSyncSettings: asyncHandler(
    async (req, res) => {
      const project = await projectService.updateGithubSyncSettings(req.params.projectId, req.body);
      return res.json({
        message: 'Configuração de sincronização GitHub atualizada com sucesso.',
        project
      });
    },
    { fallbackMessage: 'Erro ao atualizar configuração de sincronização GitHub.' }
  ),

  async notImplemented(req, res) {
    return res.status(501).json({
      message: 'Endpoint de projeto preparado para desenvolvimento futuro.'
    });
  }
};
