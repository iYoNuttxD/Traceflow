-- E6 expand-only migration. Legacy ProjectMember/accessCode/inviteLink and textual actors remain.
CREATE TABLE `User` (
  `id` INTEGER NOT NULL AUTO_INCREMENT, `name` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) NOT NULL, `passwordHash` VARCHAR(191) NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true, `emailVerifiedAt` DATETIME(3) NULL,
  `mustSetPassword` BOOLEAN NOT NULL DEFAULT false, `sessionVersion` INTEGER NOT NULL DEFAULT 1,
  `lastLoginAt` DATETIME(3) NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `User_email_key`(`email`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Session` (
  `id` INTEGER NOT NULL AUTO_INCREMENT, `userId` INTEGER NOT NULL,
  `tokenHash` VARCHAR(191) NOT NULL, `csrfTokenHash` VARCHAR(191) NOT NULL,
  `sessionVersion` INTEGER NOT NULL, `expiresAt` DATETIME(3) NOT NULL,
  `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `revokedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `Session_tokenHash_key`(`tokenHash`), INDEX `Session_userId_idx`(`userId`),
  INDEX `Session_expiresAt_idx`(`expiresAt`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PasswordResetToken` (
  `id` INTEGER NOT NULL AUTO_INCREMENT, `userId` INTEGER NOT NULL,
  `tokenHash` VARCHAR(191) NOT NULL, `expiresAt` DATETIME(3) NOT NULL,
  `usedAt` DATETIME(3) NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `PasswordResetToken_tokenHash_key`(`tokenHash`),
  INDEX `PasswordResetToken_userId_idx`(`userId`), INDEX `PasswordResetToken_expiresAt_idx`(`expiresAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ProjectMembership` (
  `id` INTEGER NOT NULL AUTO_INCREMENT, `projectId` INTEGER NOT NULL, `userId` INTEGER NOT NULL,
  `role` ENUM('OWNER','MANAGER','MEMBER','VIEWER') NOT NULL DEFAULT 'MEMBER',
  `isActive` BOOLEAN NOT NULL DEFAULT true, `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `ProjectMembership_projectId_userId_key`(`projectId`,`userId`),
  INDEX `ProjectMembership_userId_idx`(`userId`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ProjectInvitation` (
  `id` INTEGER NOT NULL AUTO_INCREMENT, `projectId` INTEGER NOT NULL, `email` VARCHAR(191) NOT NULL,
  `role` ENUM('OWNER','MANAGER','MEMBER','VIEWER') NOT NULL DEFAULT 'MEMBER',
  `tokenHash` VARCHAR(191) NOT NULL, `expiresAt` DATETIME(3) NOT NULL, `revokedAt` DATETIME(3) NULL,
  `acceptedAt` DATETIME(3) NULL, `createdById` INTEGER NOT NULL, `acceptedById` INTEGER NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `ProjectInvitation_tokenHash_key`(`tokenHash`),
  INDEX `ProjectInvitation_projectId_idx`(`projectId`), INDEX `ProjectInvitation_email_idx`(`email`),
  INDEX `ProjectInvitation_expiresAt_idx`(`expiresAt`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Task` ADD COLUMN `responsibleUserId` INTEGER NULL;
ALTER TABLE `TaskMovement` ADD COLUMN `movedByUserId` INTEGER NULL;
CREATE INDEX `Task_responsibleUserId_idx` ON `Task`(`responsibleUserId`);
CREATE INDEX `TaskMovement_movedByUserId_idx` ON `TaskMovement`(`movedByUserId`);

ALTER TABLE `Session` ADD CONSTRAINT `Session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `PasswordResetToken` ADD CONSTRAINT `PasswordResetToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ProjectMembership` ADD CONSTRAINT `ProjectMembership_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ProjectMembership` ADD CONSTRAINT `ProjectMembership_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ProjectInvitation` ADD CONSTRAINT `ProjectInvitation_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ProjectInvitation` ADD CONSTRAINT `ProjectInvitation_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ProjectInvitation` ADD CONSTRAINT `ProjectInvitation_acceptedById_fkey` FOREIGN KEY (`acceptedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Task` ADD CONSTRAINT `Task_responsibleUserId_fkey` FOREIGN KEY (`responsibleUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `TaskMovement` ADD CONSTRAINT `TaskMovement_movedByUserId_fkey` FOREIGN KEY (`movedByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
