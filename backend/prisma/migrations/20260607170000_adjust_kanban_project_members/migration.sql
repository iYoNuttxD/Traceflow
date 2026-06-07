-- AlterTable
ALTER TABLE `Project` ADD COLUMN `accessCode` VARCHAR(191) NULL,
    ADD COLUMN `inviteLink` VARCHAR(191) NULL;

-- Backfill existing projects with deterministic invite data.
UPDATE `Project`
SET `accessCode` = CONCAT('TRC-', LPAD(`id`, 6, '0')),
    `inviteLink` = CONCAT('http://localhost:5173/join/', CONCAT('TRC-', LPAD(`id`, 6, '0')))
WHERE `accessCode` IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Project_accessCode_key` ON `Project`(`accessCode`);

-- CreateTable
CREATE TABLE `ProjectMember` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `projectId` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `role` VARCHAR(191) NOT NULL DEFAULT 'MEMBRO',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ProjectMember_projectId_idx`(`projectId`),
    UNIQUE INDEX `ProjectMember_projectId_email_key`(`projectId`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `TaskMovement` ADD COLUMN `projectMemberId` INTEGER NULL;

-- CreateIndex
CREATE INDEX `TaskMovement_projectMemberId_idx` ON `TaskMovement`(`projectMemberId`);

-- AddForeignKey
ALTER TABLE `ProjectMember` ADD CONSTRAINT `ProjectMember_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskMovement` ADD CONSTRAINT `TaskMovement_projectMemberId_fkey` FOREIGN KEY (`projectMemberId`) REFERENCES `ProjectMember`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
