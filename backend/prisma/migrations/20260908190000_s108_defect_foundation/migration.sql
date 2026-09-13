-- CreateTable
CREATE TABLE `Defect` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `projectId` INTEGER NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `description` MEDIUMTEXT NOT NULL,
    `severity` ENUM('BAIXA', 'MEDIA', 'ALTA', 'CRITICA') NOT NULL,
    `status` ENUM('ABERTO', 'EM_CORRECAO', 'AGUARDANDO_RETESTE', 'VALIDADO') NOT NULL DEFAULT 'ABERTO',
    `responsibleUserId` INTEGER NOT NULL,
    `detectedExecutionStepId` INTEGER NOT NULL,
    `requirementId` INTEGER NULL,
    `currentCorrectionCycle` INTEGER NOT NULL DEFAULT 1,
    `revision` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `Defect_projectId_deletedAt_status_idx`(`projectId`, `deletedAt`, `status`),
    INDEX `Defect_projectId_severity_idx`(`projectId`, `severity`),
    INDEX `Defect_projectId_responsibleUserId_idx`(`projectId`, `responsibleUserId`),
    INDEX `Defect_projectId_requirementId_idx`(`projectId`, `requirementId`),
    INDEX `Defect_detectedExecutionStepId_idx`(`detectedExecutionStepId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DefectTask` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `defectId` INTEGER NOT NULL,
    `taskId` INTEGER NOT NULL,
    `relationType` ENUM('ORIGIN', 'CORRECTION') NOT NULL,
    `correctionCycle` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DefectTask_taskId_relationType_idx`(`taskId`, `relationType`),
    INDEX `DefectTask_defectId_relationType_correctionCycle_idx`(`defectId`, `relationType`, `correctionCycle`),
    UNIQUE INDEX `DefectTask_defectId_taskId_relationType_correctionCycle_key`(`defectId`, `taskId`, `relationType`, `correctionCycle`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DefectRetest` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `defectId` INTEGER NOT NULL,
    `testExecutionId` INTEGER NOT NULL,
    `correctionCycle` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `DefectRetest_testExecutionId_key`(`testExecutionId`),
    INDEX `DefectRetest_defectId_correctionCycle_id_idx`(`defectId`, `correctionCycle`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DefectHistoryEntry` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `projectId` INTEGER NOT NULL,
    `defectId` INTEGER NOT NULL,
    `actorUserId` INTEGER NULL,
    `action` VARCHAR(64) NOT NULL,
    `metadataJson` JSON NULL,
    `occurredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DefectHistoryEntry_defectId_occurredAt_id_idx`(`defectId`, `occurredAt`, `id`),
    INDEX `DefectHistoryEntry_projectId_occurredAt_idx`(`projectId`, `occurredAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Defect` ADD CONSTRAINT `Defect_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Defect` ADD CONSTRAINT `Defect_responsibleUserId_fkey` FOREIGN KEY (`responsibleUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Defect` ADD CONSTRAINT `Defect_detectedExecutionStepId_fkey` FOREIGN KEY (`detectedExecutionStepId`) REFERENCES `TestExecutionStep`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Defect` ADD CONSTRAINT `Defect_requirementId_fkey` FOREIGN KEY (`requirementId`) REFERENCES `Requirement`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DefectTask` ADD CONSTRAINT `DefectTask_defectId_fkey` FOREIGN KEY (`defectId`) REFERENCES `Defect`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DefectTask` ADD CONSTRAINT `DefectTask_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DefectRetest` ADD CONSTRAINT `DefectRetest_defectId_fkey` FOREIGN KEY (`defectId`) REFERENCES `Defect`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DefectRetest` ADD CONSTRAINT `DefectRetest_testExecutionId_fkey` FOREIGN KEY (`testExecutionId`) REFERENCES `TestExecution`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DefectHistoryEntry` ADD CONSTRAINT `DefectHistoryEntry_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DefectHistoryEntry` ADD CONSTRAINT `DefectHistoryEntry_defectId_fkey` FOREIGN KEY (`defectId`) REFERENCES `Defect`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DefectHistoryEntry` ADD CONSTRAINT `DefectHistoryEntry_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


ALTER TABLE `Defect` ADD CONSTRAINT `Defect_cycle_positive` CHECK (`currentCorrectionCycle` >= 1 AND `revision` >= 1);
ALTER TABLE `DefectTask` ADD CONSTRAINT `DefectTask_role_cycle` CHECK ((`relationType` = 'ORIGIN' AND `correctionCycle` = 0) OR (`relationType` = 'CORRECTION' AND `correctionCycle` >= 1));
ALTER TABLE `DefectRetest` ADD CONSTRAINT `DefectRetest_cycle_positive` CHECK (`correctionCycle` >= 1);
