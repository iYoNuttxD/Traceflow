// Controller de projetos. Recebe HTTP, chama o service e monta a resposta.
import { projectService } from './project.service.js';

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
      return res.status(error.statusCode || 500).json({
        message: error.statusCode ? error.message : 'Erro ao criar projeto a partir do repositorio GitHub.',
        error: error.statusCode ? undefined : error.message
      });
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
      return res.status(error.statusCode || 500).json({
        message: error.statusCode ? error.message : 'Erro ao atualizar configuracao de sincronizacao GitHub.',
        error: error.statusCode ? undefined : error.message
      });
    }
  },

  async notImplemented(req, res) {
    return res.status(501).json({
      message: 'Endpoint de projeto preparado para desenvolvimento futuro.'
    });
  }
};
