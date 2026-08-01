import { asyncHandler } from '../../shared/http/index.js';
import { commitService } from '../commits/commit.service.js';
import { issueService } from '../issues/issue.service.js';
import { pullRequestService } from '../pullRequests/pullRequest.service.js';
import { githubSyncService } from './githubSync.service.js';
import { auditService } from '../audit/audit.service.js';

export const githubController = {
  syncProjectGithubData: asyncHandler(
    async (req, res) => {
      await auditService.recordOperational({
        actorUserId: req.auth.user.id,
        projectId: req.params.projectId,
        requestId: req.requestId,
        action: 'GITHUB_SYNC_REQUESTED',
        resourceType: 'Project',
        resourceId: req.params.projectId
      });
      try {
        const { summary, project } = await githubSyncService.syncProjectGithubData(
          req.params.projectId
        );
        await auditService.recordOperational({
          actorUserId: req.auth.user.id,
          projectId: req.params.projectId,
          requestId: req.requestId,
          action: 'GITHUB_SYNC_SUCCEEDED',
          resourceType: 'Project',
          resourceId: req.params.projectId
        });
        return res.json({ message: 'Sincronização com GitHub concluída.', summary, project });
      } catch (error) {
        await auditService.recordOperational({
          actorUserId: req.auth.user.id,
          projectId: req.params.projectId,
          requestId: req.requestId,
          action: 'GITHUB_SYNC_FAILED',
          resourceType: 'Project',
          resourceId: req.params.projectId,
          result: 'FAILURE',
          reasonCode: error.code || 'GITHUB_SYNC_FAILED'
        });
        throw error;
      }
    },
    { fallbackMessage: 'Erro ao sincronizar artefatos do GitHub.' }
  ),

  listProjectCommits: asyncHandler(
    async (req, res) => {
      const commits = await commitService.listProjectCommits(req.params.projectId, req.query);
      return res.json({ commits });
    },
    { fallbackMessage: 'Não foi possível listar os commits do projeto.' }
  ),

  listProjectPullRequests: asyncHandler(
    async (req, res) => {
      const pullRequests = await pullRequestService.listProjectPullRequests(
        req.params.projectId,
        req.query
      );
      return res.json({ pullRequests });
    },
    { fallbackMessage: 'Não foi possível listar os pull requests do projeto.' }
  ),

  listProjectIssues: asyncHandler(
    async (req, res) => {
      const issues = await issueService.listProjectIssues(req.params.projectId, req.query);
      return res.json({ issues });
    },
    { fallbackMessage: 'Não foi possível listar as issues do projeto.' }
  )
};
