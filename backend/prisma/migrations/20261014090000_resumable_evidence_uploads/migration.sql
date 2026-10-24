-- Additive operational ledger. Intentionally no cascading business FKs:
-- ownership receipts must survive project/account deletion for safe filesystem cleanup.
CREATE TABLE `EvidenceUpload` (
  `id` CHAR(36) NOT NULL,
  `userId` INTEGER NOT NULL,
  `projectId` INTEGER NOT NULL,
  `testCaseId` INTEGER NOT NULL,
  `testCaseVersion` INTEGER NOT NULL,
  `idempotencyKey` CHAR(36) NOT NULL,
  `manifestHash` CHAR(64) NOT NULL,
  `payloadHash` CHAR(64) NULL,
  `filesJson` JSON NOT NULL,
  `totalBytes` INTEGER NOT NULL,
  `reservedBytes` INTEGER NOT NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'OPEN',
  `leaseToken` CHAR(36) NULL,
  `leaseUntil` DATETIME(3) NULL,
  `executionId` INTEGER NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `cleanedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `EvidenceUpload_executionId_key`(`executionId`),
  UNIQUE INDEX `EvidenceUpload_userId_idempotencyKey_key`(`userId`, `idempotencyKey`),
  INDEX `EvidenceUpload_testCaseId_userId_createdAt_idx`(`testCaseId`, `userId`, `createdAt`),
  INDEX `EvidenceUpload_cleanedAt_expiresAt_idx`(`cleanedAt`, `expiresAt`),
  INDEX `EvidenceUpload_leaseUntil_idx`(`leaseUntil`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `EvidenceUploadBudget` (
  `id` INTEGER NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
INSERT INTO `EvidenceUploadBudget` (`id`) VALUES (1);
