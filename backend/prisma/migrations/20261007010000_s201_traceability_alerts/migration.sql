CREATE TABLE `TraceabilityAlert` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `projectId` INTEGER NOT NULL,
  `type` ENUM('TASK_CONCLUDED_WITHOUT_COMMIT', 'PULL_REQUEST_MERGED_WITHOUT_TASK', 'ISSUE_CLOSED_WITHOUT_TASK') NOT NULL,
  `status` ENUM('OPEN', 'DISMISSED', 'RESOLVED') NOT NULL DEFAULT 'OPEN',
  `dedupeKey` VARCHAR(64) NOT NULL,
  `activeKey` VARCHAR(64) GENERATED ALWAYS AS (
    CASE WHEN `status` IN ('OPEN', 'DISMISSED') THEN `dedupeKey` ELSE NULL END
  ) STORED,
  `taskId` INTEGER NULL,
  `pullRequestId` INTEGER NULL,
  `issueId` INTEGER NULL,
  `subjectCode` VARCHAR(32) NOT NULL,
  `subjectTitle` VARCHAR(191) NOT NULL,
  `occurredAt` DATETIME(3) NULL,
  `detectedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `resolvedAt` DATETIME(3) NULL,
  `resolutionReason` ENUM('COMMIT_LINKED', 'TASK_REOPENED', 'TASK_DELETED', 'PULL_REQUEST_LINKED', 'ISSUE_LINKED', 'ISSUE_REOPENED', 'RULE_NO_LONGER_APPLIES') NULL,
  `dismissedAt` DATETIME(3) NULL,
  `dismissedByUserId` INTEGER NULL,
  `dismissalReason` VARCHAR(500) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `TraceabilityAlert_projectId_activeKey_key`(`projectId`, `activeKey`),
  INDEX `TraceabilityAlert_projectId_status_type_detectedAt_idx`(`projectId`, `status`, `type`, `detectedAt`),
  INDEX `TraceabilityAlert_taskId_idx`(`taskId`),
  INDEX `TraceabilityAlert_pullRequestId_idx`(`pullRequestId`),
  INDEX `TraceabilityAlert_issueId_idx`(`issueId`),
  INDEX `TraceabilityAlert_dismissedByUserId_idx`(`dismissedByUserId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `TraceabilityAlert`
  ADD CONSTRAINT `TraceabilityAlert_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `TraceabilityAlert`
  ADD CONSTRAINT `TraceabilityAlert_taskId_fkey`
  FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `TraceabilityAlert`
  ADD CONSTRAINT `TraceabilityAlert_pullRequestId_fkey`
  FOREIGN KEY (`pullRequestId`) REFERENCES `PullRequest`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `TraceabilityAlert`
  ADD CONSTRAINT `TraceabilityAlert_issueId_fkey`
  FOREIGN KEY (`issueId`) REFERENCES `Issue`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `TraceabilityAlert`
  ADD CONSTRAINT `TraceabilityAlert_dismissedByUserId_fkey`
  FOREIGN KEY (`dismissedByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
