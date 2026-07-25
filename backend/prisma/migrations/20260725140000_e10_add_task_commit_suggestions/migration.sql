-- RF41: sugestões específicas Commit -> Task. TaskCommit permanece a relação canônica confirmada.
CREATE TABLE `TaskCommitSuggestion` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `projectId` INTEGER NOT NULL,
  `taskId` INTEGER NOT NULL,
  `commitId` INTEGER NOT NULL,
  `status` ENUM('PENDING', 'CONFIRMED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  `detectedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `reviewedAt` DATETIME(3) NULL,
  `reviewedByUserId` INTEGER NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `TaskCommitSuggestion_taskId_commitId_key`(`taskId`, `commitId`),
  INDEX `TaskCommitSuggestion_projectId_status_idx`(`projectId`, `status`),
  INDEX `TaskCommitSuggestion_commitId_idx`(`commitId`),
  INDEX `TaskCommitSuggestion_taskId_idx`(`taskId`),
  INDEX `TaskCommitSuggestion_reviewedByUserId_idx`(`reviewedByUserId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `TaskCommitSuggestion`
  ADD CONSTRAINT `TaskCommitSuggestion_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `TaskCommitSuggestion`
  ADD CONSTRAINT `TaskCommitSuggestion_taskId_fkey`
  FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `TaskCommitSuggestion`
  ADD CONSTRAINT `TaskCommitSuggestion_commitId_fkey`
  FOREIGN KEY (`commitId`) REFERENCES `Commit`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `TaskCommitSuggestion`
  ADD CONSTRAINT `TaskCommitSuggestion_reviewedByUserId_fkey`
  FOREIGN KEY (`reviewedByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
