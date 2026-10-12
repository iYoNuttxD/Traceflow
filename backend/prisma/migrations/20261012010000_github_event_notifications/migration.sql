-- S2-03 (RF60, RF61, ADR-018): fila de eventos de issues e pull requests vinculadas e contexto do
-- artefato na notificação. A deduplicação da ocorrência é do banco: UNIQUE (projectId, occurrenceKey).

-- AlterTable
ALTER TABLE `Notification` ADD COLUMN `artifactNumber` INTEGER NULL,
    ADD COLUMN `artifactTitle` VARCHAR(256) NULL,
    ADD COLUMN `artifactUrl` VARCHAR(512) NULL,
    ADD COLUMN `githubEvent` ENUM('ISSUE_CLOSED', 'ISSUE_REOPENED', 'PULL_REQUEST_MERGED', 'PULL_REQUEST_CLOSED') NULL,
    ADD COLUMN `githubOccurredAt` DATETIME(3) NULL,
    MODIFY `type` ENUM('TASK_STATUS_CHANGED', 'TASK_OVERDUE', 'ISSUE_EVENT', 'PULL_REQUEST_EVENT') NOT NULL;

-- AlterTable
ALTER TABLE `NotificationPreference` MODIFY `type` ENUM('TASK_STATUS_CHANGED', 'TASK_OVERDUE', 'ISSUE_EVENT', 'PULL_REQUEST_EVENT') NOT NULL;

-- CreateTable
CREATE TABLE `GitHubArtifactEvent` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `projectId` INTEGER NOT NULL,
    `type` ENUM('ISSUE_CLOSED', 'ISSUE_REOPENED', 'PULL_REQUEST_MERGED', 'PULL_REQUEST_CLOSED') NOT NULL,
    `issueId` INTEGER NULL,
    `pullRequestId` INTEGER NULL,
    `artifactNumber` INTEGER NOT NULL,
    `artifactTitle` VARCHAR(256) NOT NULL,
    `artifactUrl` VARCHAR(512) NULL,
    `occurredAt` DATETIME(3) NULL,
    `detectedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `linkedTaskCount` INTEGER NOT NULL,
    `occurrenceKey` VARCHAR(96) NOT NULL,
    `status` ENUM('PENDING', 'PROCESSING', 'DISPATCHED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `nextAttemptAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `claimToken` VARCHAR(36) NULL,
    `claimedUntil` DATETIME(3) NULL,
    `lastErrorCode` VARCHAR(64) NULL,
    `dispatchedAt` DATETIME(3) NULL,
    `outcome` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `GitHubArtifactEvent_status_nextAttemptAt_idx`(`status`, `nextAttemptAt`),
    INDEX `GitHubArtifactEvent_projectId_status_idx`(`projectId`, `status`),
    INDEX `GitHubArtifactEvent_detectedAt_idx`(`detectedAt`),
    INDEX `GitHubArtifactEvent_issueId_idx`(`issueId`),
    INDEX `GitHubArtifactEvent_pullRequestId_idx`(`pullRequestId`),
    UNIQUE INDEX `GitHubArtifactEvent_projectId_occurrenceKey_key`(`projectId`, `occurrenceKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GitHubArtifactEventTask` (
    `eventId` INTEGER NOT NULL,
    `taskId` INTEGER NOT NULL,

    INDEX `GitHubArtifactEventTask_taskId_idx`(`taskId`),
    PRIMARY KEY (`eventId`, `taskId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `GitHubArtifactEvent` ADD CONSTRAINT `GitHubArtifactEvent_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GitHubArtifactEvent` ADD CONSTRAINT `GitHubArtifactEvent_issueId_fkey` FOREIGN KEY (`issueId`) REFERENCES `Issue`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GitHubArtifactEvent` ADD CONSTRAINT `GitHubArtifactEvent_pullRequestId_fkey` FOREIGN KEY (`pullRequestId`) REFERENCES `PullRequest`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GitHubArtifactEventTask` ADD CONSTRAINT `GitHubArtifactEventTask_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `GitHubArtifactEvent`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GitHubArtifactEventTask` ADD CONSTRAINT `GitHubArtifactEventTask_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

