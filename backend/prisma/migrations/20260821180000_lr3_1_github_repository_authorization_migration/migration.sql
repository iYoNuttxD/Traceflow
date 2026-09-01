-- LR.3.1 distinguishes a valid user authorization with zero repositories from
-- legacy or expired authorization evidence. Existing rows intentionally remain
-- NULL and must be renewed with a GitHub user access token.

ALTER TABLE `GitHubOAuthState`
  MODIFY `purpose` ENUM(
    'LOGIN',
    'LINK_IDENTITY',
    'REAUTH_SENSITIVE_ACTION',
    'REPOSITORY_AUTHORIZATION'
  ) NOT NULL;

ALTER TABLE `GitHubInstallationAuthorization`
  ADD COLUMN `repositoryAuthorizationVerifiedAt` DATETIME(3) NULL,
  ADD COLUMN `repositoryAuthorizationExpiresAt` DATETIME(3) NULL;
