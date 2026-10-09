ALTER TABLE `TaskMovement` ADD COLUMN `responsibleUserIdSnapshot` INTEGER NULL;
CREATE INDEX `TaskMovement_responsibleUserIdSnapshot_idx` ON `TaskMovement`(`responsibleUserIdSnapshot`);
ALTER TABLE `TaskMovement` ADD CONSTRAINT `TaskMovement_responsibleUserIdSnapshot_fkey` FOREIGN KEY (`responsibleUserIdSnapshot`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `Commit` ADD COLUMN `authorGithubUserId` VARCHAR(191) NULL;

ALTER TABLE `GitBranch` ADD COLUMN `lastSyncedGeneration` VARCHAR(36) NULL;
ALTER TABLE `CommitBranch` ADD COLUMN `lastObservedGeneration` VARCHAR(36) NULL;

CREATE UNIQUE INDEX `PullRequest_id_projectId_key` ON `PullRequest`(`id`, `projectId`);
CREATE TABLE `PullRequestLifecycleEvent` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `projectId` INTEGER NOT NULL,
    `pullRequestId` INTEGER NOT NULL,
    `eventType` VARCHAR(16) NOT NULL,
    `occurredAt` DATETIME(3) NOT NULL,
    `providerEventId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `PullRequestLifecycleEvent_projectId_providerEventId_key`(`projectId`, `providerEventId`),
    INDEX `PullRequestLifecycleEvent_projectId_occurredAt_idx`(`projectId`, `occurredAt`),
    INDEX `PullRequestLifecycleEvent_pullRequestId_occurredAt_idx`(`pullRequestId`, `occurredAt`),
    INDEX `PullRequestLifecycleEvent_pullRequestId_projectId_idx`(`pullRequestId`, `projectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `PullRequestLifecycleEvent` ADD CONSTRAINT `PullRequestLifecycleEvent_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `PullRequestLifecycleEvent` ADD CONSTRAINT `PullRequestLifecycleEvent_pullRequestId_projectId_fkey` FOREIGN KEY (`pullRequestId`, `projectId`) REFERENCES `PullRequest`(`id`, `projectId`) ON DELETE CASCADE ON UPDATE CASCADE;
