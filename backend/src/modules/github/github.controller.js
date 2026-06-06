// Controller da integracao GitHub. Recebe HTTP e delega a comunicacao ao service.
// TODO: Preparar RF06 e RF50 sem implementar dashboard ou indicadores aqui.
import { githubService } from './github.service.js';
import { githubSyncService } from './githubSync.service.js';
import { commitService } from '../commits/commit.service.js';
import { pullRequestService } from '../pullRequests/pullRequest.service.js';
import { issueService } from '../issues/issue.service.js';

export const githubController = {
  async checkAuthentication(req, res) {
    try {
      const githubUser = await githubService.checkAuthentication();

      return res.json({
        message: 'Autenticacao com GitHub realizada com sucesso.',
        githubUser
      });
    } catch (error) {
      return res.status(500).json({
        message: 'Erro ao autenticar com GitHub.',
        error: error.message
      });
    }
  },

  async listRepositories(req, res) {
    try {
      const repositories = await githubService.listRepositories();

      return res.json({ repositories });
    } catch (error) {
      return res.status(500).json({
        message: 'Erro ao acessar GitHub.',
        error: error.message
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
      return res.status(error.statusCode || 500).json({
        message: error.statusCode ? error.message : 'Erro ao sincronizar artefatos do GitHub.',
        error: error.statusCode ? undefined : error.message
      });
    }
  },

  async listProjectCommits(req, res) {
    try {
      const commits = await commitService.listProjectCommits(req.params.projectId);

      return res.json({ commits });
    } catch (error) {
      return res.status(error.statusCode || 500).json({
        message: error.statusCode ? error.message : 'Erro ao listar commits importados.',
        error: error.statusCode ? undefined : error.message
      });
    }
  },

  async listProjectPullRequests(req, res) {
    try {
      const pullRequests = await pullRequestService.listProjectPullRequests(req.params.projectId);

      return res.json({ pullRequests });
    } catch (error) {
      return res.status(error.statusCode || 500).json({
        message: error.statusCode ? error.message : 'Erro ao listar pull requests importados.',
        error: error.statusCode ? undefined : error.message
      });
    }
  },

  async listProjectIssues(req, res) {
    try {
      const issues = await issueService.listProjectIssues(req.params.projectId);

      return res.json({ issues });
    } catch (error) {
      return res.status(error.statusCode || 500).json({
        message: error.statusCode ? error.message : 'Erro ao listar issues importadas.',
        error: error.statusCode ? undefined : error.message
      });
    }
  },

  async notImplemented(req, res) {
    return res.status(501).json({ message: 'GitHub endpoint prepared for future development.' });
  }
};
