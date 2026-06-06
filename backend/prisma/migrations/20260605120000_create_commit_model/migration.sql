-- CreateTable
CREATE TABLE `Commit` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `hash` VARCHAR(191) NOT NULL,
    `message` TEXT NULL,
    `authorName` VARCHAR(191) NULL,
    `authorEmail` VARCHAR(191) NULL,
    `authorUsername` VARCHAR(191) NULL,
    `date` DATETIME(3) NULL,
    `branch` VARCHAR(191) NULL,
    `githubUrl` VARCHAR(191) NULL,
    `projectId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Commit_projectId_hash_key`(`projectId`, `hash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Commit` ADD CONSTRAINT `Commit_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
