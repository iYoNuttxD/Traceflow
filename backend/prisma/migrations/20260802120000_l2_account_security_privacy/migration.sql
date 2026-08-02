CREATE TABLE `EmailChangeRequest` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `userId` INTEGER NOT NULL,
  `currentEmailSnapshot` VARCHAR(191) NOT NULL,
  `newEmail` VARCHAR(191) NOT NULL,
  `tokenHash` VARCHAR(191) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `verifiedAt` DATETIME(3) NULL,
  `cancelledAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `EmailChangeRequest_tokenHash_key`(`tokenHash`),
  INDEX `EmailChangeRequest_userId_createdAt_idx`(`userId`, `createdAt`),
  INDEX `EmailChangeRequest_expiresAt_idx`(`expiresAt`),
  INDEX `EmailChangeRequest_newEmail_idx`(`newEmail`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AccountReactivationToken` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `userId` INTEGER NOT NULL,
  `tokenHash` VARCHAR(191) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `usedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `AccountReactivationToken_tokenHash_key`(`tokenHash`),
  INDEX `AccountReactivationToken_userId_idx`(`userId`),
  INDEX `AccountReactivationToken_expiresAt_idx`(`expiresAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `User`
  ADD COLUMN `accountStatus` ENUM('ACTIVE', 'DEACTIVATED', 'DELETION_PENDING', 'ANONYMIZED') NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN `deactivatedAt` DATETIME(3) NULL,
  ADD COLUMN `usernameChangedAt` DATETIME(3) NULL,
  ADD COLUMN `anonymizedAt` DATETIME(3) NULL,
  ADD INDEX `User_accountStatus_idx`(`accountStatus`);

ALTER TABLE `Session` ADD COLUMN `publicId` VARCHAR(191) NULL;
UPDATE `Session` SET `publicId` = UUID() WHERE `publicId` IS NULL;
ALTER TABLE `Session`
  MODIFY `publicId` VARCHAR(191) NOT NULL,
  ADD UNIQUE INDEX `Session_publicId_key`(`publicId`);

ALTER TABLE `PrivacyRequest`
  ADD COLUMN `processingStartedAt` DATETIME(3) NULL,
  ADD COLUMN `failureCode` VARCHAR(191) NULL,
  ADD COLUMN `lastAttemptAt` DATETIME(3) NULL;

UPDATE `User`
SET `accountStatus` = CASE WHEN `isActive` = true THEN 'ACTIVE' ELSE 'DEACTIVATED' END;

ALTER TABLE `EmailChangeRequest`
  ADD CONSTRAINT `EmailChangeRequest_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `AccountReactivationToken`
  ADD CONSTRAINT `AccountReactivationToken_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
