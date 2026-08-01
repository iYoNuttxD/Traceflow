import { createSign } from 'node:crypto';
import { Octokit } from '@octokit/rest';
import { env } from '../../config/env.js';
import { ERROR_CODES, ExternalServiceError } from '../../shared/errors/index.js';

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

function unavailable(cause) {
  return new ExternalServiceError(
    'Integração GitHub App indisponível.',
    503,
    ERROR_CODES.GITHUB_AUTH_FAILED,
    { cause }
  );
}

export function createGithubAppCredentialProvider({
  environment = env,
  OctokitClass = Octokit,
  fetchImpl = globalThis.fetch
} = {}) {
  function assertConfigured() {
    if (!environment.githubAppConfigured) throw unavailable();
  }
  function appJwt() {
    assertConfigured();
    try {
      const now = Math.floor(Date.now() / 1000);
      const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iat: now - 60, exp: now + 540, iss: environment.githubAppId })}`;
      const signer = createSign('RSA-SHA256');
      signer.update(unsigned);
      signer.end();
      const privateKey = Buffer.from(environment.githubAppPrivateKeyBase64, 'base64').toString(
        'utf8'
      );
      return `${unsigned}.${signer.sign(privateKey).toString('base64url')}`;
    } catch (error) {
      throw unavailable(error);
    }
  }
  function appClient() {
    return new OctokitClass({
      auth: appJwt(),
      baseUrl: 'https://api.github.com',
      request: { timeout: environment.githubRequestTimeoutMs }
    });
  }
  return Object.freeze({
    isConfigured: () => environment.githubAppConfigured === true,
    async createInstallationToken(installationId) {
      try {
        const response = await appClient().rest.apps.createInstallationAccessToken({
          installation_id: Number(installationId)
        });
        return response.data.token;
      } catch (error) {
        throw unavailable(error);
      }
    },
    async exchangeUserCode(code) {
      assertConfigured();
      try {
        const response = await fetchImpl('https://github.com/login/oauth/access_token', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({
            client_id: environment.githubAppClientId,
            client_secret: environment.githubAppClientSecret,
            code,
            redirect_uri: environment.githubAppCallbackUrl
          })
        });
        const payload = await response.json();
        if (!response.ok || !payload.access_token)
          throw new Error(payload.error || 'oauth_exchange_failed');
        return payload.access_token;
      } catch (error) {
        throw unavailable(error);
      }
    },
    createUserClient(token) {
      assertConfigured();
      return new OctokitClass({
        auth: token,
        baseUrl: 'https://api.github.com',
        request: { timeout: environment.githubRequestTimeoutMs }
      });
    }
  });
}

export const githubAppCredentialProvider = createGithubAppCredentialProvider();
