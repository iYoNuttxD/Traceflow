-- Additive scheduling metadata; existing runs remain MANUAL and history is preserved.
ALTER TABLE `ProjectGitHubIntegration`
  ADD COLUMN `nextSyncAt` DATETIME(3) NULL,
  ADD COLUMN `consecutiveSyncFailures` INTEGER NOT NULL DEFAULT 0;
CREATE INDEX `ProjectGitHubIntegration_autoSyncEnabled_status_nextSyncAt_idx`
  ON `ProjectGitHubIntegration`(`autoSyncEnabled`, `status`, `nextSyncAt`);
ALTER TABLE `GitHubInstallation` ADD COLUMN `syncNotBefore` DATETIME(3) NULL;
ALTER TABLE `GitHubSyncRun`
  MODIFY `requestedByUserId` INTEGER NULL,
  ADD COLUMN `origin` ENUM('MANUAL', 'AUTOMATIC') NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN `automaticSlot` INTEGER NULL,
  ADD COLUMN `automaticInstallationId` INTEGER NULL;
CREATE UNIQUE INDEX `GitHubSyncRun_automaticSlot_key` ON `GitHubSyncRun`(`automaticSlot`);
CREATE UNIQUE INDEX `GitHubSyncRun_automaticInstallationId_key` ON `GitHubSyncRun`(`automaticInstallationId`);
