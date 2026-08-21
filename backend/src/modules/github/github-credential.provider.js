import { createSign } from 'node:crypto';
import { Octokit } from '@octokit/rest';
import { env } from '../../config/env.js';
import { ERROR_CODES, ExternalServiceError } from '../../shared/errors/index.js';
import { executeGithubRequest } from './github-request.js';
import { mapGithubRepository } from './github.mapper.js';

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

function installationDto(item) {
  return {
    githubInstallationId: String(item.id),
    accountId: String(item.account?.id),
    accountLogin: item.account?.login || item.account?.name || 'unknown',
    accountType: item.account?.type || 'Unknown',
    installedAt: item.created_at ? new Date(item.created_at) : new Date()
  };
}

function unavailable(cause) {
  return new ExternalServiceError(
    'Integração GitHub App indisponível.',
    503,
    ERROR_CODES.GITHUB_AUTH_FAILED,
    { cause }
  );
}

function repositoryPermission(item, githubLogin) {
  if (
    typeof item.owner?.login === 'string' &&
    typeof githubLogin === 'string' &&
    item.owner.login.toLowerCase() === githubLogin.toLowerCase()
  ) {
    return 'OWNER';
  }
  return item.permissions?.admin === true ? 'ADMIN' : null;
}

export function createGithubAppCredentialProvider({
  environment = env,
  OctokitClass = Octokit,
  fetchImpl = globalThis.fetch,
  requestExecutor = executeGithubRequest
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
  function userClient(userAccessToken) {
    assertConfigured();
    return new OctokitClass({
      auth: userAccessToken,
      baseUrl: 'https://api.github.com',
      request: { timeout: environment.githubRequestTimeoutMs }
    });
  }
  async function exchangeUserCode({ code, redirectUri, codeVerifier }) {
    assertConfigured();
    try {
      const body = new URLSearchParams({
        client_id: environment.githubAppClientId,
        client_secret: environment.githubAppClientSecret,
        code,
        redirect_uri: redirectUri
      });
      if (codeVerifier) body.set('code_verifier', codeVerifier);
      const response = await fetchImpl('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body
      });
      const payload = await response.json();
      if (!response.ok || !payload.access_token)
        throw new Error(payload.error || 'oauth_exchange_failed');
      return payload.access_token;
    } catch (error) {
      throw unavailable(error);
    }
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
    exchangeInstallationUserCode(code) {
      return exchangeUserCode({ code, redirectUri: environment.githubAppCallbackUrl });
    },
    exchangeLoginUserCode({ code, codeVerifier }) {
      return exchangeUserCode({
        code,
        codeVerifier,
        redirectUri: environment.githubLoginCallbackUrl
      });
    },
    async getAuthenticatedUser(userAccessToken) {
      try {
        const response = await requestExecutor(
          () => userClient(userAccessToken).request('GET /user'),
          {
            maxRetries: environment.githubRetryMax
          }
        );
        return response.data;
      } catch (error) {
        throw unavailable(error);
      }
    },
    async getPrimaryVerifiedEmail(userAccessToken) {
      try {
        const response = await requestExecutor(
          () => userClient(userAccessToken).request('GET /user/emails', { per_page: 100 }),
          { maxRetries: environment.githubRetryMax }
        );
        return (Array.isArray(response.data) ? response.data : []).find(
          (item) =>
            item?.primary === true && item?.verified === true && typeof item.email === 'string'
        )?.email;
      } catch (error) {
        throw unavailable(error);
      }
    },
    async listInstallationsAccessibleToUser(userAccessToken) {
      const client = userClient(userAccessToken);
      const installations = [];
      let page = 1;
      while (true) {
        const response = await requestExecutor(
          () => client.request('GET /user/installations', { per_page: 100, page }),
          { maxRetries: environment.githubRetryMax }
        );
        const currentPage = Array.isArray(response.data?.installations)
          ? response.data.installations
          : [];
        installations.push(...currentPage.map(installationDto));
        const totalCount = Number(response.data?.total_count);
        if (
          currentPage.length < 100 ||
          (Number.isFinite(totalCount) && installations.length >= totalCount)
        )
          break;
        page += 1;
      }
      return installations;
    },
    async listRepositoriesAccessibleToUser(userAccessToken, githubInstallationId, githubLogin) {
      const client = userClient(userAccessToken);
      const repositories = [];
      let page = 1;
      while (true) {
        const response = await requestExecutor(
          () =>
            client.request('GET /user/installations/{installation_id}/repositories', {
              installation_id: Number(githubInstallationId),
              per_page: 100,
              page
            }),
          { maxRetries: environment.githubRetryMax }
        );
        const currentPage = Array.isArray(response.data?.repositories)
          ? response.data.repositories
          : [];
        for (const item of currentPage) {
          const permission = repositoryPermission(item, githubLogin);
          if (permission) repositories.push({ ...mapGithubRepository(item), permission });
        }
        const totalCount = Number(response.data?.total_count);
        if (currentPage.length < 100 || (Number.isFinite(totalCount) && page * 100 >= totalCount)) {
          break;
        }
        page += 1;
      }
      return repositories;
    }
  });
}

export const githubAppCredentialProvider = createGithubAppCredentialProvider();
