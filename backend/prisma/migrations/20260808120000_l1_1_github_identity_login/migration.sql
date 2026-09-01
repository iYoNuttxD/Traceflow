-- AlterTable
ALTER TABLE `Session` ADD COLUMN `lastReauthenticatedAt` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `GitHubIdentity` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `githubUserId` VARCHAR(191) NOT NULL,
    `githubLogin` VARCHAR(191) NOT NULL,
    `linkedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastAuthenticatedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `GitHubIdentity_userId_key`(`userId`),
    UNIQUE INDEX `GitHubIdentity_githubUserId_key`(`githubUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GitHubOAuthState` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tokenHash` VARCHAR(191) NOT NULL,
    `purpose` ENUM('LOGIN', 'LINK_IDENTITY', 'REAUTH_SET_PASSWORD') NOT NULL,
    `userId` INTEGER NULL,
    `sessionId` INTEGER NULL,
    `rememberMe` BOOLEAN NOT NULL DEFAULT false,
    `returnTo` VARCHAR(191) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `GitHubOAuthState_tokenHash_key`(`tokenHash`),
    INDEX `GitHubOAuthState_userId_expiresAt_idx`(`userId`, `expiresAt`),
    INDEX `GitHubOAuthState_sessionId_idx`(`sessionId`),
    INDEX `GitHubOAuthState_purpose_expiresAt_idx`(`purpose`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `GitHubIdentity` ADD CONSTRAINT `GitHubIdentity_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GitHubOAuthState` ADD CONSTRAINT `GitHubOAuthState_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GitHubOAuthState` ADD CONSTRAINT `GitHubOAuthState_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
