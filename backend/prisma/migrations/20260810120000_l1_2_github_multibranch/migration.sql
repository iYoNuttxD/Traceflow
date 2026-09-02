-- CreateTable
CREATE TABLE `GitBranch` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `projectId` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `headSha` VARCHAR(191) NULL,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `lastSeenAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `GitBranch_projectId_name_key`(`projectId`, `name`),
    INDEX `GitBranch_projectId_isActive_idx`(`projectId`, `isActive`),
    INDEX `GitBranch_projectId_isDefault_idx`(`projectId`, `isDefault`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CommitBranch` (
    `commitId` INTEGER NOT NULL,
    `branchId` INTEGER NOT NULL,

    INDEX `CommitBranch_branchId_idx`(`branchId`),
    PRIMARY KEY (`commitId`, `branchId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Backfill branches from the non-destructive legacy Commit.branch field.
INSERT INTO `GitBranch` (
    `projectId`, `name`, `headSha`, `isDefault`, `isActive`, `lastSeenAt`, `createdAt`, `updatedAt`
)
SELECT DISTINCT
    `Commit`.`projectId`,
    `Commit`.`branch`,
    NULL,
    CASE WHEN `Commit`.`branch` = `Project`.`githubDefaultBranch` THEN true ELSE false END,
    true,
    CURRENT_TIMESTAMP(3),
    CURRENT_TIMESTAMP(3),
    CURRENT_TIMESTAMP(3)
FROM `Commit`
INNER JOIN `Project` ON `Project`.`id` = `Commit`.`projectId`
WHERE `Commit`.`branch` IS NOT NULL AND TRIM(`Commit`.`branch`) <> '';

-- Backfill the N:N relation without changing or deleting canonical commits.
INSERT INTO `CommitBranch` (`commitId`, `branchId`)
SELECT `Commit`.`id`, `GitBranch`.`id`
FROM `Commit`
INNER JOIN `GitBranch`
    ON `GitBranch`.`projectId` = `Commit`.`projectId`
    AND `GitBranch`.`name` = `Commit`.`branch`
WHERE `Commit`.`branch` IS NOT NULL AND TRIM(`Commit`.`branch`) <> '';

-- AddForeignKey
ALTER TABLE `GitBranch` ADD CONSTRAINT `GitBranch_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CommitBranch` ADD CONSTRAINT `CommitBranch_commitId_fkey` FOREIGN KEY (`commitId`) REFERENCES `Commit`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CommitBranch` ADD CONSTRAINT `CommitBranch_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `GitBranch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
