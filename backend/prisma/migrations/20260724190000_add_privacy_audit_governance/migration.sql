CREATE TABLE `AuditEvent` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `occurredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `actorUserId` INTEGER NULL,
  `actorType` ENUM('USER', 'SYSTEM') NOT NULL DEFAULT 'USER',
  `projectId` INTEGER NULL,
  `action` VARCHAR(191) NOT NULL,
  `resourceType` VARCHAR(191) NOT NULL,
  `resourceId` VARCHAR(191) NULL,
  `result` ENUM('SUCCESS', 'FAILURE') NOT NULL DEFAULT 'SUCCESS',
  `reasonCode` VARCHAR(191) NULL,
  `requestId` VARCHAR(191) NULL,
  `metadataJson` JSON NULL,
  `retentionUntil` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `AuditEvent_actorUserId_occurredAt_idx`(`actorUserId`, `occurredAt`),
  INDEX `AuditEvent_projectId_occurredAt_idx`(`projectId`, `occurredAt`),
  INDEX `AuditEvent_action_occurredAt_idx`(`action`, `occurredAt`),
  INDEX `AuditEvent_retentionUntil_idx`(`retentionUntil`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PrivacyRequest` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `userId` INTEGER NOT NULL,
  `type` ENUM('DATA_EXPORT', 'ACCOUNT_DEACTIVATION', 'ACCOUNT_DELETION', 'DATA_CORRECTION') NOT NULL,
  `status` ENUM('PENDING', 'CANCELLED', 'COMPLETED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `scheduledFor` DATETIME(3) NULL,
  `completedAt` DATETIME(3) NULL,
  `cancelledAt` DATETIME(3) NULL,
  `reasonCode` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `PrivacyRequest_userId_type_status_idx`(`userId`, `type`, `status`),
  INDEX `PrivacyRequest_scheduledFor_idx`(`scheduledFor`),
  INDEX `PrivacyRequest_updatedAt_idx`(`updatedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PersonalDataExport` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `userId` INTEGER NOT NULL,
  `status` ENUM('PENDING', 'COMPLETED', 'EXPIRED', 'FAILED') NOT NULL DEFAULT 'PENDING',
  `format` VARCHAR(191) NOT NULL DEFAULT 'JSON',
  `expiresAt` DATETIME(3) NOT NULL,
  `completedAt` DATETIME(3) NULL,
  `failedAt` DATETIME(3) NULL,
  `errorCode` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `PersonalDataExport_userId_createdAt_idx`(`userId`, `createdAt`),
  INDEX `PersonalDataExport_status_expiresAt_idx`(`status`, `expiresAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `AuditEvent` ADD CONSTRAINT `AuditEvent_actorUserId_fkey`
  FOREIGN KEY (`actorUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `AuditEvent` ADD CONSTRAINT `AuditEvent_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `PrivacyRequest` ADD CONSTRAINT `PrivacyRequest_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `PersonalDataExport` ADD CONSTRAINT `PersonalDataExport_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
