import { env } from '../../config/env.js';
import { asyncHandler } from '../../shared/http/index.js';
import { auditService } from '../audit/audit.service.js';
import { parseCookies } from '../../middlewares/auth/authentication.middleware.js';
import { setSessionCookie } from './auth.controller.js';
import { githubAuthService } from './github-auth.service.js';

export const githubOAuthCookieOptions = (maxAge = env.githubOAuthStateTtlMs) => ({
  httpOnly: true,
  secure: env.isProduction,
  sameSite: 'lax',
  path: '/api/auth/github/callback',
  maxAge
});

export function setGithubOAuthCookie(res, result) {
  res.cookie(
    env.githubOAuthCookieName,
    result.browserCookie,
    githubOAuthCookieOptions(result.expiresInMs)
  );
  return { url: result.url, expiresInMs: result.expiresInMs };
}

function clearGithubOAuthCookie(res) {
  res.clearCookie(env.githubOAuthCookieName, {
    ...githubOAuthCookieOptions(),
    maxAge: undefined
  });
}

const reasonByCode = Object.freeze({
  GITHUB_VERIFIED_EMAIL_REQUIRED: 'verified_email_required',
  GITHUB_EMAIL_ACCOUNT_CONFLICT: 'email_conflict',
  GITHUB_OAUTH_STATE_INVALID: 'invalid_state',
  GITHUB_OAUTH_STATE_EXPIRED: 'expired_state',
  GITHUB_IDENTITY_ALREADY_LINKED: 'identity_conflict',
  GITHUB_IDENTITY_ALREADY_EXISTS: 'identity_exists',
  GITHUB_IDENTITY_MISMATCH: 'identity_mismatch',
  ACCOUNT_ANONYMIZED: 'account_anonymized',
  GITHUB_LOGIN_UNAVAILABLE: 'unavailable'
});

function errorRedirect(error) {
  const path =
    error.oauthPurpose === 'LINK_IDENTITY'
      ? '/settings/integrations'
      : error.oauthPurpose === 'REAUTH_SENSITIVE_ACTION'
        ? error.oauthReturnTo || '/settings/security'
        : '/login';
  const url = new URL(path, env.frontendUrl);
  url.searchParams.set('github', 'error');
  url.searchParams.set('reason', reasonByCode[error.code] || 'oauth_failed');
  return url.toString();
}

export const githubAuthController = {
  startLogin: asyncHandler(async (req, res) => {
    const result = await githubAuthService.startLogin(req.body);
    await auditService.recordOperational({
      requestId: req.requestId,
      action: 'GITHUB_LOGIN_STARTED',
      resourceType: 'GitHubIdentity'
    });
    return res.json(setGithubOAuthCookie(res, result));
  }),
  startSensitiveReauthentication: asyncHandler(async (req, res) => {
    const result = await githubAuthService.startSensitiveReauthentication(req.auth, req.body);
    await auditService.recordOperational({
      actorUserId: req.auth.user.id,
      requestId: req.requestId,
      action: 'GITHUB_REAUTH_STARTED',
      resourceType: 'Session',
      resourceId: req.auth.session.id
    });
    return res.json(setGithubOAuthCookie(res, result));
  }),
  callback: asyncHandler(async (req, res) => {
    try {
      const result = await githubAuthService.completeCallback({
        code: req.query.code,
        state: req.query.state,
        browserCookie: parseCookies(req.headers.cookie)[env.githubOAuthCookieName]
      });
      clearGithubOAuthCookie(res);
      if (result.purpose === 'LOGIN') {
        await auditService.recordOperational({
          actorUserId: result.user.id,
          requestId: req.requestId,
          action: 'GITHUB_LOGIN_SUCCESS',
          resourceType: 'User',
          resourceId: result.user.id
        });
        if (result.accountCreated) {
          await auditService.recordOperational({
            actorUserId: result.user.id,
            requestId: req.requestId,
            action: 'GITHUB_ACCOUNT_CREATED',
            resourceType: 'User',
            resourceId: result.user.id
          });
        }
        setSessionCookie(res, result);
        const status = result.user.accountStatus || 'ACTIVE';
        const returnTo = status === 'ACTIVE' ? result.returnTo : '/restricted';
        return res.redirect(302, new URL(returnTo, env.frontendUrl).toString());
      }
      const action =
        result.purpose === 'LINK_IDENTITY' ? 'GITHUB_IDENTITY_LINKED' : 'GITHUB_REAUTH_SUCCESS';
      await auditService.recordOperational({
        actorUserId: result.userId,
        requestId: req.requestId,
        action,
        resourceType: result.purpose === 'LINK_IDENTITY' ? 'GitHubIdentity' : 'Session'
      });
      const url = new URL(result.returnTo, env.frontendUrl);
      url.searchParams.set(
        result.purpose === 'LINK_IDENTITY' ? 'githubIdentity' : 'githubReauth',
        'success'
      );
      return res.redirect(302, url.toString());
    } catch (error) {
      clearGithubOAuthCookie(res);
      await auditService.recordOperational({
        requestId: req.requestId,
        actorUserId: error.oauthUserId,
        action:
          error.oauthPurpose === 'REAUTH_SENSITIVE_ACTION'
            ? 'GITHUB_REAUTH_FAILURE'
            : 'GITHUB_LOGIN_FAILURE',
        resourceType: 'GitHubIdentity',
        result: 'FAILURE',
        reasonCode: error.code || 'GITHUB_OAUTH_FAILED'
      });
      return res.redirect(302, errorRedirect(error));
    }
  })
};
