-- S1-05/RF29+RF31: comentários persistidos das tarefas com autoria real da sessão.
-- Exclusão é lógica: deletedAt/deletedById preservam o registro para auditoria e a
-- listagem exibe somente comentários ativos.
CREATE TABLE `TaskComment` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `projectId` INTEGER NOT NULL,
  `taskId` INTEGER NOT NULL,
  `authorUserId` INTEGER NOT NULL,
  `content` TEXT NOT NULL,
  `editedAt` DATETIME(3) NULL,
  `deletedAt` DATETIME(3) NULL,
  `deletedById` INTEGER NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `TaskComment_taskId_deletedAt_createdAt_idx`(`taskId`, `deletedAt`, `createdAt`),
  INDEX `TaskComment_projectId_createdAt_idx`(`projectId`, `createdAt`),
  INDEX `TaskComment_authorUserId_idx`(`authorUserId`),
  INDEX `TaskComment_deletedById_idx`(`deletedById`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `TaskComment`
  ADD CONSTRAINT `TaskComment_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `TaskComment`
  ADD CONSTRAINT `TaskComment_taskId_fkey`
  FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `TaskComment`
  ADD CONSTRAINT `TaskComment_authorUserId_fkey`
  FOREIGN KEY (`authorUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `TaskComment`
  ADD CONSTRAINT `TaskComment_deletedById_fkey`
  FOREIGN KEY (`deletedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
