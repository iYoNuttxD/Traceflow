-- Nullable additions: legacy snapshots remain unknown; no retroactive backfill.
ALTER TABLE `SprintTask` ADD COLUMN `closingTaskSnapshot` JSON NULL;
ALTER TABLE `Sprint` ADD COLUMN `deletedAt` DATETIME(3) NULL, ADD COLUMN `deletedById` INTEGER NULL;
ALTER TABLE `Milestone` ADD COLUMN `deletedAt` DATETIME(3) NULL, ADD COLUMN `deletedById` INTEGER NULL;
CREATE INDEX `Sprint_projectId_deletedAt_status_idx` ON `Sprint` (`projectId`, `deletedAt`, `status`);
CREATE INDEX `Sprint_deletedById_idx` ON `Sprint` (`deletedById`);
CREATE INDEX `Milestone_projectId_deletedAt_status_idx` ON `Milestone` (`projectId`, `deletedAt`, `status`);
CREATE INDEX `Milestone_deletedById_idx` ON `Milestone` (`deletedById`);
ALTER TABLE `Sprint` ADD CONSTRAINT `Sprint_deletedById_fkey` FOREIGN KEY (`deletedById`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Milestone` ADD CONSTRAINT `Milestone_deletedById_fkey` FOREIGN KEY (`deletedById`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
