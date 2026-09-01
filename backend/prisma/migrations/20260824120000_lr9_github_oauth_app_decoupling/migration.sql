-- LR.9 separates GitHub authentication identity from GitHub App repository access.
-- Repository permission snapshots and their TTL are obsolete; installations,
-- installation authorizations, project integrations and artifacts are preserved.

-- A pending state from the superseded repository-authorization OAuth purpose
-- cannot be completed after this contract and carries no durable authorization.
DELETE FROM `GitHubOAuthState`
WHERE `purpose` = 'REPOSITORY_AUTHORIZATION';

DROP TABLE `GitHubRepositoryAuthorization`;

ALTER TABLE `GitHubInstallationAuthorization`
  DROP COLUMN `repositoryAuthorizationVerifiedAt`,
  DROP COLUMN `repositoryAuthorizationExpiresAt`;

ALTER TABLE `GitHubOAuthState`
  MODIFY `purpose` ENUM(
    'LOGIN',
    'LINK_IDENTITY',
    'REAUTH_SENSITIVE_ACTION'
  ) NOT NULL;
