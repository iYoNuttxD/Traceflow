// Controller da integracao GitHub. Recebe HTTP e delega a comunicacao ao service.
// TODO: Preparar RF06 e RF50 sem implementar dashboard ou indicadores aqui.
import { githubService } from './github.service.js';
import { githubSyncService } from './githubSync.service.js';
import { commitService } from '../commits/commit.service.js';
import { pullRequestService } from '../pullRequests/pullRequest.service.js';
import { issueService } from '../issues/issue.service.js';

function sendGithubError(res, error, fallbackMessage) {
  if (!error.statusCode) {
    console.error(fallbackMessage, error);
  }

  return res.status(error.statusCode || 500).json({
    message: error.statusCode ? error.message : fallbackMessage
  });
}

export const githubController = {
  async checkAuthentication(req, res) {
    try {
      const githubUser = await githubService.checkAuthentication();

      return res.json({
        message: 'Autenticacao com GitHub realizada com sucesso.',
        githubUser
      });
    } catch (error) {
      console.error('Erro ao verificar autenticacao com GitHub:', error);

      return res.status(500).json({
        message: 'Não foi possível verificar a autenticação com o GitHub.'
      });
    }
  },

  async listRepositories(req, res) {
    try {
      const repositories = await githubService.listRepositories();

      return res.json({ repositories });
    } catch (error) {
      console.error('Erro ao listar repositorios do GitHub:', error);

      return res.status(500).json({
        message: 'Não foi possível listar os repositórios do GitHub.'
      });
    }
  },

  async syncProjectGithubArtifacts(req, res) {
    try {
      const summary = await githubSyncService.syncGithubArtifacts(req.params.projectId);

      return res.json({
        message: 'Sincronizacao com GitHub concluida.',
        summary
      });
    } catch (error) {
      return sendGithubError(res, error, 'Erro ao sincronizar artefatos do GitHub.');
    }
  },

  async listProjectCommits(req, res) {
    try {
      const commits = await commitService.listProjectCommits(req.params.projectId);

      return res.json({ commits });
    } catch (error) {
      return sendGithubError(res, error, 'Não foi possível listar os commits do projeto.');
    }
  },

  async listProjectPullRequests(req, res) {
    try {
      const pullRequests = await pullRequestService.listProjectPullRequests(req.params.projectId);

      return res.json({ pullRequests });
    } catch (error) {
      return sendGithubError(res, error, 'Não foi possível listar os pull requests do projeto.');
    }
  },

  async listProjectIssues(req, res) {
    try {
      const issues = await issueService.listProjectIssues(req.params.projectId);

      return res.json({ issues });
    } catch (error) {
      return sendGithubError(res, error, 'Não foi possível listar as issues do projeto.');
    }
  },

  async notImplemented(req, res) {
    return res.status(501).json({
      message: 'Endpoint GitHub preparado para desenvolvimento futuro.'
    });
  }
};
