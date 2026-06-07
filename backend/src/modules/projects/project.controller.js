// Controller de projetos. Recebe HTTP, chama o service e monta a resposta.
import { projectService } from './project.service.js';

function sendProjectError(res, error, fallbackMessage) {
  if (!error.statusCode) {
    console.error(fallbackMessage, error);
  }

  return res.status(error.statusCode || 500).json({
    message: error.statusCode ? error.message : fallbackMessage
  });
}

export const projectController = {
  async create(req, res) {
    try {
      const project = await projectService.createProject(req.body);

      return res.status(201).json({
        message: 'Projeto cadastrado com sucesso.',
        project
      });
    } catch (error) {
      return res.status(error.statusCode || 500).json({
        message: error.statusCode ? error.message : 'Erro interno ao processar projeto.'
      });
    }
  },

  async findAll(req, res) {
    try {
      const projects = await projectService.findAllProjects();

      return res.json({ projects });
    } catch (error) {
      return res.status(500).json({
        message: 'Erro interno ao processar projeto.'
      });
    }
  },

  async findById(req, res) {
    try {
      const project = await projectService.getProjectById(req.params.id);

      return res.json({ project });
    } catch (error) {
      return res.status(error.statusCode || 500).json({
        message: error.statusCode ? error.message : 'Erro interno ao processar projeto.'
      });
    }
  },

  async listMembers(req, res) {
    try {
      const members = await projectService.listProjectMembers(req.params.projectId);

      return res.json({
        projectId: Number(req.params.projectId),
        members
      });
    } catch (error) {
      return res.status(error.statusCode || 500).json({
        message: error.statusCode ? error.message : 'Erro interno ao processar membros do projeto.'
      });
    }
  },

  async addMember(req, res) {
    try {
      const member = await projectService.addProjectMember(req.params.projectId, req.body);

      return res.status(201).json({
        message: 'Membro adicionado ao projeto com sucesso.',
        member
      });
    } catch (error) {
      return res.status(error.statusCode || 500).json({
        message: error.statusCode ? error.message : 'Erro interno ao processar membros do projeto.'
      });
    }
  },

  async join(req, res) {
    try {
      const result = await projectService.joinProject(req.body);

      return res.status(201).json({
        message: 'Entrada no projeto realizada com sucesso.',
        project: result.project,
        member: result.member
      });
    } catch (error) {
      return res.status(error.statusCode || 500).json({
        message: error.statusCode ? error.message : 'Erro interno ao entrar no projeto.'
      });
    }
  },

  async update(req, res) {
    try {
      const project = await projectService.updateProject(req.params.id, req.body);

      return res.json({
        message: 'Projeto atualizado com sucesso.',
        project
      });
    } catch (error) {
      return res.status(error.statusCode || 500).json({
        message: error.statusCode ? error.message : 'Erro interno ao processar projeto.'
      });
    }
  },

  async getById(req, res) {
    return projectController.findById(req, res);
  },

  async createFromGithub(req, res) {
    try {
      const project = await projectService.createProjectFromGithubRepository(req.body);

      return res.status(201).json({
        message: 'Projeto criado a partir do repositorio GitHub com sucesso.',
        project
      });
    } catch (error) {
      return sendProjectError(
        res,
        error,
        'Não foi possível criar o projeto a partir do GitHub.'
      );
    }
  },

  async updateGithubSyncSettings(req, res) {
    try {
      const project = await projectService.updateGithubSyncSettings(req.params.projectId, req.body);

      return res.json({
        message: 'Configuracao de sincronizacao GitHub atualizada com sucesso.',
        project
      });
    } catch (error) {
      return sendProjectError(
        res,
        error,
        'Erro ao atualizar configuracao de sincronizacao GitHub.'
      );
    }
  },

  async notImplemented(req, res) {
    return res.status(501).json({
      message: 'Endpoint de projeto preparado para desenvolvimento futuro.'
    });
  }
};
