CREATE TABLE `TaskPullRequest` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `taskId` INTEGER NOT NULL,
  `pullRequestId` INTEGER NOT NULL,
  `linkedByUserId` INTEGER NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `TaskPullRequest_taskId_pullRequestId_key`(`taskId`, `pullRequestId`),
  INDEX `TaskPullRequest_taskId_createdAt_idx`(`taskId`, `createdAt`),
  INDEX `TaskPullRequest_pullRequestId_idx`(`pullRequestId`),
  INDEX `TaskPullRequest_linkedByUserId_idx`(`linkedByUserId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `TaskPullRequest`
  ADD CONSTRAINT `TaskPullRequest_taskId_fkey`
  FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `TaskPullRequest`
  ADD CONSTRAINT `TaskPullRequest_pullRequestId_fkey`
  FOREIGN KEY (`pullRequestId`) REFERENCES `PullRequest`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `TaskPullRequest`
  ADD CONSTRAINT `TaskPullRequest_linkedByUserId_fkey`
  FOREIGN KEY (`linkedByUserId`) REFERENCES `User`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
