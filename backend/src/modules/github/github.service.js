import { env } from '../../config/env.js';

export const githubService = {
  configurationStatus() {
    return { configured: env.githubAppConfigured === true, provider: 'github_app' };
  }
};
