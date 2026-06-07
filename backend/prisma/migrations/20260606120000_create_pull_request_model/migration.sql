-- CreateTable
CREATE TABLE `PullRequest` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `githubId` VARCHAR(191) NOT NULL,
    `number` INTEGER NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `state` VARCHAR(191) NULL,
    `authorUsername` VARCHAR(191) NULL,
    `sourceBranch` VARCHAR(191) NULL,
    `targetBranch` VARCHAR(191) NULL,
    `githubUrl` VARCHAR(191) NULL,
    `createdAtGithub` DATETIME(3) NULL,
    `updatedAtGithub` DATETIME(3) NULL,
    `closedAtGithub` DATETIME(3) NULL,
    `mergedAtGithub` DATETIME(3) NULL,
    `projectId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PullRequest_projectId_githubId_key`(`projectId`, `githubId`),
    UNIQUE INDEX `PullRequest_projectId_number_key`(`projectId`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PullRequest` ADD CONSTRAINT `PullRequest_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
