-- LR.3 separates GitHub user authority from the GitHub App technical boundary,
-- makes installation lifecycle explicit and allows failed webhook deliveries to retry.

-- Expand first so existing DELETED values remain valid during conversion.
ALTER TABLE `GitHubInstallation`
  MODIFY `status` ENUM('PENDING', 'ACTIVE', 'SUSPENDED', 'DELETED', 'REMOVED') NOT NULL DEFAULT 'PENDING';

UPDATE `GitHubInstallation` SET `status` = 'REMOVED' WHERE `status` = 'DELETED';

-- Contract only after every historical value was converted.
ALTER TABLE `GitHubInstallation`
  MODIFY `status` ENUM('PENDING', 'ACTIVE', 'SUSPENDED', 'REMOVED') NOT NULL DEFAULT 'PENDING';

CREATE TABLE `GitHubRepositoryAuthorization` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `installationId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `githubRepositoryId` VARCHAR(191) NOT NULL,
    `repositoryFullName` VARCHAR(191) NOT NULL,
    `permission` ENUM('OWNER', 'ADMIN') NOT NULL,
    `verifiedAt` DATETIME(3) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `GHRepoAuth_installation_user_repo_key`(`installationId`, `userId`, `githubRepositoryId`),
    INDEX `GHRepoAuth_user_expires_idx`(`userId`, `expiresAt`),
    INDEX `GHRepoAuth_installation_expires_idx`(`installationId`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `GitHubRepositoryAuthorization` ADD CONSTRAINT `GHRepoAuth_installation_fkey`
  FOREIGN KEY (`installationId`) REFERENCES `GitHubInstallation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `GitHubRepositoryAuthorization` ADD CONSTRAINT `GHRepoAuth_user_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `GitHubWebhookDelivery`
  ADD COLUMN `status` ENUM('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED') NOT NULL DEFAULT 'RECEIVED',
  ADD COLUMN `attemptCount` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `lastAttemptAt` DATETIME(3) NULL,
  ADD COLUMN `failureStep` VARCHAR(191) NULL,
  ADD COLUMN `failureCode` VARCHAR(191) NULL;

UPDATE `GitHubWebhookDelivery`
SET
  `status` = CASE WHEN `processedAt` IS NULL THEN 'FAILED' ELSE 'PROCESSED' END,
  `attemptCount` = 1,
  `lastAttemptAt` = COALESCE(`processedAt`, `receivedAt`),
  `failureStep` = CASE WHEN `processedAt` IS NULL THEN 'legacy_delivery' ELSE NULL END,
  `failureCode` = CASE WHEN `processedAt` IS NULL THEN 'GITHUB_WEBHOOK_LEGACY_INCOMPLETE' ELSE NULL END;

CREATE INDEX `GitHubWebhookDelivery_status_lastAttemptAt_idx`
  ON `GitHubWebhookDelivery`(`status`, `lastAttemptAt`);
