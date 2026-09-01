-- AlterTable: lifecycle e checkpoint seguro por branch.
ALTER TABLE `GitBranch`
    ADD COLUMN `lastSyncedHeadSha` VARCHAR(191) NULL,
    ADD COLUMN `firstSeenAt` DATETIME(3) NULL,
    ADD COLUMN `inactiveAt` DATETIME(3) NULL,
    ADD COLUMN `reactivatedAt` DATETIME(3) NULL,
    ADD COLUMN `reactivationCount` INTEGER NOT NULL DEFAULT 0;

UPDATE `GitBranch` SET `firstSeenAt` = `createdAt` WHERE `firstSeenAt` IS NULL;

ALTER TABLE `GitBranch` MODIFY `firstSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- CreateTable: execução assíncrona persistida, sem infraestrutura externa.
CREATE TABLE `GitHubSyncRun` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `projectId` INTEGER NOT NULL,
    `requestedByUserId` INTEGER NOT NULL,
    `activeProjectId` INTEGER NULL,
    `status` ENUM('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED') NOT NULL DEFAULT 'QUEUED',
    `step` ENUM('QUEUED', 'REPOSITORY', 'BRANCHES', 'COMMITS', 'PULL_REQUESTS', 'ISSUES', 'PERSIST', 'COMPLETED') NOT NULL DEFAULT 'QUEUED',
    `currentBranch` VARCHAR(191) NULL,
    `startedAt` DATETIME(3) NULL,
    `heartbeatAt` DATETIME(3) NULL,
    `finishedAt` DATETIME(3) NULL,
    `durationMs` INTEGER NULL,
    `branchCount` INTEGER NOT NULL DEFAULT 0,
    `processedBranches` INTEGER NOT NULL DEFAULT 0,
    `commitPages` INTEGER NOT NULL DEFAULT 0,
    `commitsFound` INTEGER NOT NULL DEFAULT 0,
    `commitsObserved` INTEGER NOT NULL DEFAULT 0,
    `commitsCreated` INTEGER NOT NULL DEFAULT 0,
    `commitLinksCreated` INTEGER NOT NULL DEFAULT 0,
    `pullRequestsFound` INTEGER NOT NULL DEFAULT 0,
    `pullRequestsCreated` INTEGER NOT NULL DEFAULT 0,
    `pullRequestsUpdated` INTEGER NOT NULL DEFAULT 0,
    `issuesFound` INTEGER NOT NULL DEFAULT 0,
    `issuesCreated` INTEGER NOT NULL DEFAULT 0,
    `issuesUpdated` INTEGER NOT NULL DEFAULT 0,
    `errorCode` VARCHAR(191) NULL,
    `errorMessage` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `GitHubSyncRun_activeProjectId_key`(`activeProjectId`),
    INDEX `GitHubSyncRun_projectId_createdAt_idx`(`projectId`, `createdAt`),
    INDEX `GitHubSyncRun_status_updatedAt_idx`(`status`, `updatedAt`),
    INDEX `GitHubSyncRun_requestedByUserId_createdAt_idx`(`requestedByUserId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `GitHubSyncRun` ADD CONSTRAINT `GitHubSyncRun_projectId_fkey`
    FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `GitHubSyncRun` ADD CONSTRAINT `GitHubSyncRun_requestedByUserId_fkey`
    FOREIGN KEY (`requestedByUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
