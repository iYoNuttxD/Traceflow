// Controller de projetos. Recebe HTTP e delega regras ao service.
// TODO: Implementar RF01 e RF22 completos sem colocar regras de negocio neste arquivo.
import { projectService } from './project.service.js';

export const projectController = {
  async getById(req, res) {
    try {
      const project = await projectService.getProjectById(req.params.id);

      return res.json({ project });
    } catch (error) {
      return res.status(error.statusCode || 500).json({
        message: error.statusCode ? error.message : 'Erro ao consultar projeto.',
        error: error.statusCode ? undefined : error.message
      });
    }
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
    return res.status(501).json({ message: 'Project endpoint prepared for future development.' });
  }
};
