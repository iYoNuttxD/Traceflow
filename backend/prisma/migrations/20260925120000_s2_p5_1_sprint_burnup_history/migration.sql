ALTER TABLE `Sprint` ADD COLUMN `burnupCoverageStartedAt` DATETIME(3) NULL;

CREATE TABLE `SprintBurnupEvent` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `projectId` INTEGER NOT NULL,
  `sprintId` INTEGER NOT NULL,
  `taskKey` INTEGER NOT NULL,
  `type` ENUM('BASELINE_TASK', 'TASK_ADDED', 'TASK_REMOVED', 'ESTIMATE_CHANGED', 'STATUS_CHANGED') NOT NULL,
  `previousPoints` DOUBLE NULL,
  `newPoints` DOUBLE NULL,
  `fromStatus` VARCHAR(191) NULL,
  `toStatus` VARCHAR(191) NULL,
  `occurredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `SprintBurnupEvent_sprintId_occurredAt_id_idx` ON `SprintBurnupEvent`(`sprintId`, `occurredAt`, `id`);
CREATE INDEX `SprintBurnupEvent_projectId_idx` ON `SprintBurnupEvent`(`projectId`);
ALTER TABLE `SprintBurnupEvent` ADD CONSTRAINT `SprintBurnupEvent_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `SprintBurnupEvent` ADD CONSTRAINT `SprintBurnupEvent_sprintId_fkey` FOREIGN KEY (`sprintId`) REFERENCES `Sprint`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- An active legacy Sprint gets a current-state anchor, never a retroactive start.
-- The application is quiesced during migration, so each anchor and its timestamp
-- describe the same database state.
UPDATE `Sprint`
SET `burnupCoverageStartedAt` = CURRENT_TIMESTAMP(3)
WHERE `status` = 'EM_ANDAMENTO' AND `startedAt` IS NOT NULL AND `burnupCoverageStartedAt` IS NULL;

INSERT INTO `SprintBurnupEvent`
  (`projectId`, `sprintId`, `taskKey`, `type`, `newPoints`, `toStatus`, `occurredAt`)
SELECT s.`projectId`, s.`id`, t.`id`, 'BASELINE_TASK', t.`estimatedEffort`, t.`status`, s.`burnupCoverageStartedAt`
FROM `Sprint` s
JOIN `SprintTask` st ON st.`sprintId` = s.`id` AND st.`removedAt` IS NULL AND st.`taskId` IS NOT NULL
JOIN `Task` t ON t.`id` = st.`taskId` AND t.`projectId` = s.`projectId`
WHERE s.`status` = 'EM_ANDAMENTO' AND s.`burnupCoverageStartedAt` IS NOT NULL;
