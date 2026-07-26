-- E11/RF38: histórico funcional de status, prazo, responsável e prioridade.
CREATE TABLE `TaskHistoryEntry` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `projectId` INTEGER NOT NULL,
  `taskId` INTEGER NOT NULL,
  `actorUserId` INTEGER NOT NULL,
  `field` ENUM('STATUS', 'DEADLINE', 'RESPONSIBLE', 'PRIORITY') NOT NULL,
  `fromValue` VARCHAR(191) NULL,
  `toValue` VARCHAR(191) NULL,
  `occurredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `TaskHistoryEntry_projectId_occurredAt_idx`(`projectId`, `occurredAt`),
  INDEX `TaskHistoryEntry_taskId_occurredAt_idx`(`taskId`, `occurredAt`),
  INDEX `TaskHistoryEntry_actorUserId_occurredAt_idx`(`actorUserId`, `occurredAt`),
  INDEX `TaskHistoryEntry_field_occurredAt_idx`(`field`, `occurredAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `TaskHistoryEntry`
  ADD CONSTRAINT `TaskHistoryEntry_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `TaskHistoryEntry`
  ADD CONSTRAINT `TaskHistoryEntry_taskId_fkey`
  FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `TaskHistoryEntry`
  ADD CONSTRAINT `TaskHistoryEntry_actorUserId_fkey`
  FOREIGN KEY (`actorUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
