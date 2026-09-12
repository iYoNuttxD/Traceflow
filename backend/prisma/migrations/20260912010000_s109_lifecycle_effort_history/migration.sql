-- Incremental adoption: no historical events or lifecycle transitions fabricated.
ALTER TABLE `Requirement` ALTER COLUMN `status` SET DEFAULT 'PLANEJADO';
CREATE TABLE `TaskEffortHistoryEntry` (
 `id` INTEGER NOT NULL AUTO_INCREMENT,
 `projectId` INTEGER NOT NULL,
 `taskId` INTEGER NOT NULL,
 `sessionId` INTEGER NOT NULL,
 `eventType` VARCHAR(191) NOT NULL,
 `source` ENUM('TIMER','MANUAL') NOT NULL,
 `actorUserId` INTEGER NULL,
 `previousSeconds` INTEGER NULL,
 `newSeconds` INTEGER NULL,
 `snapshotStartedAt` DATETIME(3) NOT NULL,
 `snapshotEndedAt` DATETIME(3) NULL,
 `occurredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY (`id`),
 INDEX `TaskEffortHistoryEntry_taskId_occurredAt_id_idx` (`taskId`,`occurredAt`,`id`),
 INDEX `TaskEffortHistoryEntry_projectId_idx` (`projectId`),
 INDEX `TaskEffortHistoryEntry_actorUserId_idx` (`actorUserId`),
 CONSTRAINT `TaskEffortHistoryEntry_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT `TaskEffortHistoryEntry_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
