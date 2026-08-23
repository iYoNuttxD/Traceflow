-- LR.4 makes GitHub reauthentication generic for sensitive actions and retains only
-- a keyed, deny-only fingerprint after account anonymization.

-- Expand before converting OAuth states that may still be pending during deployment.
ALTER TABLE `GitHubOAuthState`
  MODIFY `purpose` ENUM('LOGIN', 'LINK_IDENTITY', 'REAUTH_SET_PASSWORD', 'REAUTH_SENSITIVE_ACTION') NOT NULL;

UPDATE `GitHubOAuthState`
SET `purpose` = 'REAUTH_SENSITIVE_ACTION'
WHERE `purpose` = 'REAUTH_SET_PASSWORD';

-- Contract only after all historical live rows use the canonical purpose.
ALTER TABLE `GitHubOAuthState`
  MODIFY `purpose` ENUM('LOGIN', 'LINK_IDENTITY', 'REAUTH_SENSITIVE_ACTION') NOT NULL;

CREATE TABLE `GitHubIdentityTombstone` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `githubUserFingerprint` CHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `GitHubIdentityTombstone_fingerprint_key`(`githubUserFingerprint`),
    INDEX `GitHubIdentityTombstone_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
