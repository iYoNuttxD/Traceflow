-- S201-A05: resultado da última reconciliação de alertas do projeto inteiro (sync, conexão,
-- reprocessamento manual e script). Sem dado pessoal; só o código do erro, nunca a mensagem.

CREATE TABLE `TraceabilityAlertReconciliation` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `projectId` INTEGER NOT NULL,
  `lastTrigger` ENUM('GITHUB_SYNC', 'GITHUB_INTEGRATION', 'MANUAL', 'SCRIPT') NOT NULL,
  `lastAttemptAt` DATETIME(3) NOT NULL,
  `lastSucceededAt` DATETIME(3) NULL,
  `lastFailedAt` DATETIME(3) NULL,
  `lastErrorCode` VARCHAR(64) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `TraceabilityAlertReconciliation_projectId_key`(`projectId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `TraceabilityAlertReconciliation`
  ADD CONSTRAINT `TraceabilityAlertReconciliation_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
