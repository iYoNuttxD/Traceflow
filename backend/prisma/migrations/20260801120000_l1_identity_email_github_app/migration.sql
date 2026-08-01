-- L1 identity expand/backfill/contract and direct migration to GitHub App.
-- Existing identities receive an explicitly technical username; no human identity is inferred.
ALTER TABLE `User`
  ADD COLUMN `username` VARCHAR(191) NULL,
  ADD COLUMN `mustSetUsername` BOOLEAN NOT NULL DEFAULT false;

UPDATE `User`
SET `username` = CONCAT('user-', `id`), `mustSetUsername` = true
WHERE `username` IS NULL;

ALTER TABLE `User` MODIFY `username` VARCHAR(191) NOT NULL;
CREATE UNIQUE INDEX `User_username_key` ON `User`(`username`);

ALTER TABLE `Session`
  ADD COLUMN `rememberMe` BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE `EmailVerificationToken` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `userId` INTEGER NOT NULL,
  `tokenHash` VARCHAR(191) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `usedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `EmailVerificationToken_tokenHash_key`(`tokenHash`),
  INDEX `EmailVerificationToken_userId_idx`(`userId`),
  INDEX `EmailVerificationToken_expiresAt_idx`(`expiresAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `EmailVerificationToken_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `GitHubInstallation` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `githubInstallationId` VARCHAR(191) NOT NULL,
  `accountId` VARCHAR(191) NOT NULL,
  `accountLogin` VARCHAR(191) NOT NULL,
  `accountType` VARCHAR(191) NOT NULL,
  `status` ENUM('ACTIVE','SUSPENDED','DELETED') NOT NULL DEFAULT 'ACTIVE',
  `suspendedAt` DATETIME(3) NULL,
  `installedAt` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `GitHubInstallation_githubInstallationId_key`(`githubInstallationId`),
  INDEX `GitHubInstallation_accountId_idx`(`accountId`),
  INDEX `GitHubInstallation_status_idx`(`status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `GitHubInstallationAuthorization` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `installationId` INTEGER NOT NULL,
  `userId` INTEGER NOT NULL,
  `verifiedAt` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `GitHubInstallationAuthorization_installationId_userId_key`(`installationId`,`userId`),
  INDEX `GitHubInstallationAuthorization_userId_idx`(`userId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `GitHubInstallationAuthorization_installationId_fkey`
    FOREIGN KEY (`installationId`) REFERENCES `GitHubInstallation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `GitHubInstallationAuthorization_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ProjectGitHubIntegration` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `projectId` INTEGER NOT NULL,
  `installationId` INTEGER NULL,
  `githubRepositoryId` VARCHAR(191) NULL,
  `repositoryName` VARCHAR(191) NULL,
  `repositoryFullName` VARCHAR(191) NULL,
  `repositoryUrl` VARCHAR(191) NULL,
  `defaultBranch` VARCHAR(191) NULL,
  `status` ENUM('ACTIVE','RECONNECT_REQUIRED','DISCONNECTED') NOT NULL DEFAULT 'RECONNECT_REQUIRED',
  `lastValidatedAt` DATETIME(3) NULL,
  `lastSyncAt` DATETIME(3) NULL,
  `lastSyncStatus` VARCHAR(191) NULL,
  `lastSyncError` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `ProjectGitHubIntegration_projectId_key`(`projectId`),
  UNIQUE INDEX `ProjectGitHubIntegration_projectId_githubRepositoryId_key`(`projectId`,`githubRepositoryId`),
  INDEX `ProjectGitHubIntegration_installationId_status_idx`(`installationId`,`status`),
  INDEX `ProjectGitHubIntegration_githubRepositoryId_idx`(`githubRepositoryId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `ProjectGitHubIntegration_projectId_fkey`
    FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ProjectGitHubIntegration_installationId_fkey`
    FOREIGN KEY (`installationId`) REFERENCES `GitHubInstallation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `ProjectGitHubIntegration` (
  `projectId`, `githubRepositoryId`, `repositoryName`, `repositoryFullName`, `repositoryUrl`,
  `defaultBranch`, `status`, `lastSyncAt`, `lastSyncStatus`, `lastSyncError`, `updatedAt`
)
SELECT
  `id`, `githubRepositoryId`, COALESCE(`githubRepositoryName`, `githubRepo`),
  `githubRepositoryFullName`, COALESCE(`githubRepositoryUrl`, `githubUrl`),
  `githubDefaultBranch`, 'RECONNECT_REQUIRED', `githubLastSyncAt`, `githubSyncStatus`,
  `githubLastSyncError`, CURRENT_TIMESTAMP(3)
FROM `Project`
WHERE `githubRepositoryId` IS NOT NULL OR `githubRepositoryFullName` IS NOT NULL
   OR (`githubOwner` IS NOT NULL AND `githubRepo` IS NOT NULL);

CREATE TABLE `GitHubAppConnectionState` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `userId` INTEGER NOT NULL,
  `sessionId` INTEGER NOT NULL,
  `tokenHash` VARCHAR(191) NOT NULL,
  `intendedAction` VARCHAR(191) NOT NULL,
  `projectId` INTEGER NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `usedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `GitHubAppConnectionState_tokenHash_key`(`tokenHash`),
  INDEX `GitHubAppConnectionState_userId_expiresAt_idx`(`userId`,`expiresAt`),
  INDEX `GitHubAppConnectionState_sessionId_idx`(`sessionId`),
  INDEX `GitHubAppConnectionState_projectId_idx`(`projectId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `GitHubAppConnectionState_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `GitHubAppConnectionState_sessionId_fkey`
    FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `GitHubAppConnectionState_projectId_fkey`
    FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `GitHubWebhookDelivery` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `deliveryId` VARCHAR(191) NOT NULL,
  `event` VARCHAR(191) NOT NULL,
  `action` VARCHAR(191) NULL,
  `installationId` VARCHAR(191) NULL,
  `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `processedAt` DATETIME(3) NULL,
  UNIQUE INDEX `GitHubWebhookDelivery_deliveryId_key`(`deliveryId`),
  INDEX `GitHubWebhookDelivery_installationId_idx`(`installationId`),
  INDEX `GitHubWebhookDelivery_receivedAt_idx`(`receivedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
