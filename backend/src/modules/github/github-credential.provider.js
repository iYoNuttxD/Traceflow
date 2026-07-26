import { env } from '../../config/env.js';
import { ERROR_CODES, ExternalServiceError } from '../../shared/errors/index.js';

export function createGithubCredentialProvider({ environment = env } = {}) {
  return Object.freeze({
    getToken() {
      if (!environment.githubToken) {
        throw new ExternalServiceError(
          'Integração GitHub indisponível.',
          500,
          ERROR_CODES.GITHUB_AUTH_FAILED
        );
      }

      return environment.githubToken;
    }
  });
}

export const githubCredentialProvider = createGithubCredentialProvider();
