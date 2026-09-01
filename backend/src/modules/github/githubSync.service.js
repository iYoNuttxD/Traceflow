import { syncProjectGithubData } from './services/sync-project-github.service.js';
import {
  executeGithubSyncRun,
  getProjectGithubSyncStatus,
  requestProjectGithubSync
} from './services/github-sync-run.service.js';

export const githubSyncService = {
  executeGithubSyncRun,
  getProjectGithubSyncStatus,
  requestProjectGithubSync,
  syncProjectGithubData
};
