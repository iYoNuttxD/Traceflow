-- S1-06 (RF32/RF33/RF34): sessões de tempo por tarefa e esforço realizado derivado.
-- Task.actualEffort passa a DOUBLE para representar horas decimais calculadas a
-- partir das sessões encerradas; os valores inteiros existentes são preservados.
ALTER TABLE `Task` MODIFY COLUMN `actualEffort` DOUBLE NULL;

CREATE TABLE `TaskTimeEntry` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `projectId` INTEGER NOT NULL,
  `taskId` INTEGER NOT NULL,
  `source` ENUM('TIMER', 'MANUAL') NOT NULL DEFAULT 'TIMER',
  `startedAt` DATETIME(3) NOT NULL,
  `endedAt` DATETIME(3) NULL,
  `durationSeconds` INTEGER NULL,
  `note` VARCHAR(191) NULL,
  `startedById` INTEGER NOT NULL,
  `endedById` INTEGER NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `TaskTimeEntry_taskId_endedAt_idx`(`taskId`, `endedAt`),
  INDEX `TaskTimeEntry_taskId_startedAt_id_idx`(`taskId`, `startedAt`, `id`),
  INDEX `TaskTimeEntry_projectId_startedAt_idx`(`projectId`, `startedAt`),
  INDEX `TaskTimeEntry_startedById_idx`(`startedById`),
  INDEX `TaskTimeEntry_endedById_idx`(`endedById`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `TaskTimeEntry`
  ADD CONSTRAINT `TaskTimeEntry_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `TaskTimeEntry`
  ADD CONSTRAINT `TaskTimeEntry_taskId_fkey`
  FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `TaskTimeEntry`
  ADD CONSTRAINT `TaskTimeEntry_startedById_fkey`
  FOREIGN KEY (`startedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `TaskTimeEntry`
  ADD CONSTRAINT `TaskTimeEntry_endedById_fkey`
  FOREIGN KEY (`endedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
