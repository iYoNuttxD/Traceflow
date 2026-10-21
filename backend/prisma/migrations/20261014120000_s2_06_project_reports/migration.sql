-- CreateTable
CREATE TABLE `ProjectReport` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `projectId` INTEGER NOT NULL,
    `requestedByUserId` INTEGER NULL,
    `activeProjectId` INTEGER NULL,
    `status` ENUM('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED') NOT NULL DEFAULT 'QUEUED',
    `startDate` VARCHAR(10) NULL,
    `endDate` VARCHAR(10) NULL,
    `timeZone` VARCHAR(100) NULL,
    `sprintId` INTEGER NULL,
    `snapshotVersion` INTEGER NULL,
    `snapshot` JSON NULL,
    `startedAt` DATETIME(3) NULL,
    `heartbeatAt` DATETIME(3) NULL,
    `finishedAt` DATETIME(3) NULL,
    `durationMs` INTEGER NULL,
    `errorCode` VARCHAR(191) NULL,
    `errorMessage` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ProjectReport_activeProjectId_key`(`activeProjectId`),
    INDEX `ProjectReport_projectId_createdAt_idx`(`projectId`, `createdAt`),
    INDEX `ProjectReport_status_finishedAt_idx`(`status`, `finishedAt`),
    INDEX `ProjectReport_requestedByUserId_createdAt_idx`(`requestedByUserId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectReportPerson` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `reportId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `displayNameSnapshot` VARCHAR(191) NOT NULL,
    `usernameSnapshot` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ProjectReportPerson_userId_idx`(`userId`),
    UNIQUE INDEX `ProjectReportPerson_reportId_userId_key`(`reportId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ProjectReport` ADD CONSTRAINT `ProjectReport_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectReport` ADD CONSTRAINT `ProjectReport_requestedByUserId_fkey` FOREIGN KEY (`requestedByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectReportPerson` ADD CONSTRAINT `ProjectReportPerson_reportId_fkey` FOREIGN KEY (`reportId`) REFERENCES `ProjectReport`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
