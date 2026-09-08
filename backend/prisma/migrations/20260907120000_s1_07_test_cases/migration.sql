-- CreateTable
CREATE TABLE `TestCase` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `projectId` INTEGER NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `description` MEDIUMTEXT NULL,
    `preconditions` MEDIUMTEXT NOT NULL,
    `expectedResult` MEDIUMTEXT NOT NULL,
    `status` ENUM('ATIVO', 'INATIVO') NOT NULL DEFAULT 'ATIVO',
    `responsibleUserId` INTEGER NOT NULL,
    `requirementId` INTEGER NULL,
    `currentVersion` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,
    `deletedById` INTEGER NULL,

    INDEX `TestCase_projectId_deletedAt_status_idx`(`projectId`, `deletedAt`, `status`),
    INDEX `TestCase_projectId_responsibleUserId_idx`(`projectId`, `responsibleUserId`),
    INDEX `TestCase_projectId_requirementId_idx`(`projectId`, `requirementId`),
    INDEX `TestCase_projectId_createdAt_idx`(`projectId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TestCaseStep` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `testCaseId` INTEGER NOT NULL,
    `position` INTEGER NOT NULL,
    `action` MEDIUMTEXT NOT NULL,
    `expectedResult` MEDIUMTEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TestCaseStep_testCaseId_position_key`(`testCaseId`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TestCaseTask` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `testCaseId` INTEGER NOT NULL,
    `taskId` INTEGER NOT NULL,

    INDEX `TestCaseTask_taskId_idx`(`taskId`),
    UNIQUE INDEX `TestCaseTask_testCaseId_taskId_key`(`testCaseId`, `taskId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TestCaseVersion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `testCaseId` INTEGER NOT NULL,
    `version` INTEGER NOT NULL,
    `snapshotVersion` INTEGER NOT NULL DEFAULT 1,
    `snapshotJson` JSON NOT NULL,
    `createdByUserId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TestCaseVersion_testCaseId_createdAt_idx`(`testCaseId`, `createdAt`),
    UNIQUE INDEX `TestCaseVersion_testCaseId_version_key`(`testCaseId`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TestCaseHistoryEntry` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `projectId` INTEGER NOT NULL,
    `testCaseId` INTEGER NOT NULL,
    `actorUserId` INTEGER NULL,
    `action` ENUM('CREATED', 'VERSION_CREATED', 'STATUS_CHANGED', 'RESPONSIBLE_CHANGED', 'DELETED') NOT NULL,
    `fromVersion` INTEGER NULL,
    `toVersion` INTEGER NULL,
    `metadataJson` JSON NULL,
    `occurredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TestCaseHistoryEntry_testCaseId_occurredAt_id_idx`(`testCaseId`, `occurredAt`, `id`),
    INDEX `TestCaseHistoryEntry_projectId_occurredAt_idx`(`projectId`, `occurredAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TestExecution` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `projectId` INTEGER NOT NULL,
    `testCaseId` INTEGER NOT NULL,
    `testCaseVersionId` INTEGER NOT NULL,
    `testCaseVersion` INTEGER NOT NULL,
    `environment` ENUM('LOCAL', 'DESENVOLVIMENTO', 'HOMOLOGACAO') NOT NULL,
    `result` ENUM('PASS', 'FAIL', 'BLOCKED') NOT NULL,
    `testedReferenceType` ENUM('PULL_REQUEST', 'COMMIT') NOT NULL,
    `testedPullRequestId` INTEGER NULL,
    `testedCommitId` INTEGER NULL,
    `testedReferenceSnapshot` JSON NOT NULL,
    `executedByUserId` INTEGER NULL,
    `executedByDisplayNameSnapshot` VARCHAR(191) NOT NULL,
    `executedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TestExecution_testCaseId_executedAt_id_idx`(`testCaseId`, `executedAt`, `id`),
    INDEX `TestExecution_projectId_executedAt_idx`(`projectId`, `executedAt`),
    INDEX `TestExecution_testCaseId_result_idx`(`testCaseId`, `result`),
    INDEX `TestExecution_testedPullRequestId_idx`(`testedPullRequestId`),
    INDEX `TestExecution_testedCommitId_idx`(`testedCommitId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TestExecutionStep` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `executionId` INTEGER NOT NULL,
    `position` INTEGER NOT NULL,
    `actionSnapshot` MEDIUMTEXT NOT NULL,
    `expectedResultSnapshot` MEDIUMTEXT NOT NULL,
    `result` ENUM('PASS', 'FAIL', 'BLOCKED') NOT NULL,
    `observedResult` MEDIUMTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `TestExecutionStep_executionId_position_key`(`executionId`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TestEvidence` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `projectId` INTEGER NOT NULL,
    `executionId` INTEGER NOT NULL,
    `executionStepId` INTEGER NULL,
    `scope` ENUM('EXECUTION', 'STEP') NOT NULL,
    `kind` ENUM('IMAGE', 'VIDEO', 'DOCUMENT', 'TEXT', 'DATA') NOT NULL,
    `originalName` VARCHAR(200) NOT NULL,
    `mimeType` VARCHAR(100) NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `sha256` CHAR(64) NOT NULL,
    `storageKey` VARCHAR(100) NOT NULL,
    `uploadedByUserId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `TestEvidence_storageKey_key`(`storageKey`),
    INDEX `TestEvidence_executionId_idx`(`executionId`),
    INDEX `TestEvidence_executionStepId_idx`(`executionStepId`),
    INDEX `TestEvidence_projectId_idx`(`projectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `TestCase` ADD CONSTRAINT `TestCase_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TestCase` ADD CONSTRAINT `TestCase_responsibleUserId_fkey` FOREIGN KEY (`responsibleUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TestCase` ADD CONSTRAINT `TestCase_deletedById_fkey` FOREIGN KEY (`deletedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TestCase` ADD CONSTRAINT `TestCase_requirementId_fkey` FOREIGN KEY (`requirementId`) REFERENCES `Requirement`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TestCaseStep` ADD CONSTRAINT `TestCaseStep_testCaseId_fkey` FOREIGN KEY (`testCaseId`) REFERENCES `TestCase`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TestCaseTask` ADD CONSTRAINT `TestCaseTask_testCaseId_fkey` FOREIGN KEY (`testCaseId`) REFERENCES `TestCase`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TestCaseTask` ADD CONSTRAINT `TestCaseTask_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TestCaseVersion` ADD CONSTRAINT `TestCaseVersion_testCaseId_fkey` FOREIGN KEY (`testCaseId`) REFERENCES `TestCase`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TestCaseVersion` ADD CONSTRAINT `TestCaseVersion_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TestCaseHistoryEntry` ADD CONSTRAINT `TestCaseHistoryEntry_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TestCaseHistoryEntry` ADD CONSTRAINT `TestCaseHistoryEntry_testCaseId_fkey` FOREIGN KEY (`testCaseId`) REFERENCES `TestCase`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TestCaseHistoryEntry` ADD CONSTRAINT `TestCaseHistoryEntry_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TestExecution` ADD CONSTRAINT `TestExecution_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TestExecution` ADD CONSTRAINT `TestExecution_testCaseId_fkey` FOREIGN KEY (`testCaseId`) REFERENCES `TestCase`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TestExecution` ADD CONSTRAINT `TestExecution_testCaseVersionId_fkey` FOREIGN KEY (`testCaseVersionId`) REFERENCES `TestCaseVersion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TestExecution` ADD CONSTRAINT `TestExecution_testedPullRequestId_fkey` FOREIGN KEY (`testedPullRequestId`) REFERENCES `PullRequest`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `TestExecution` ADD CONSTRAINT `TestExecution_testedCommitId_fkey` FOREIGN KEY (`testedCommitId`) REFERENCES `Commit`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `TestExecution` ADD CONSTRAINT `TestExecution_executedByUserId_fkey` FOREIGN KEY (`executedByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TestExecutionStep` ADD CONSTRAINT `TestExecutionStep_executionId_fkey` FOREIGN KEY (`executionId`) REFERENCES `TestExecution`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TestEvidence` ADD CONSTRAINT `TestEvidence_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TestEvidence` ADD CONSTRAINT `TestEvidence_executionId_fkey` FOREIGN KEY (`executionId`) REFERENCES `TestExecution`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TestEvidence` ADD CONSTRAINT `TestEvidence_executionStepId_fkey` FOREIGN KEY (`executionStepId`) REFERENCES `TestExecutionStep`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `TestEvidence` ADD CONSTRAINT `TestEvidence_uploadedByUserId_fkey` FOREIGN KEY (`uploadedByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- XOR is enforced physically, including the discriminator. Referenced IDs are immutable.
ALTER TABLE `TestExecution` ADD CONSTRAINT `TestExecution_primary_reference_check` CHECK (
 (`testedReferenceType` = 'PULL_REQUEST' AND `testedPullRequestId` IS NOT NULL AND `testedCommitId` IS NULL)
 OR (`testedReferenceType` = 'COMMIT' AND `testedCommitId` IS NOT NULL AND `testedPullRequestId` IS NULL)
);
ALTER TABLE `TestEvidence` ADD CONSTRAINT `TestEvidence_scope_check` CHECK (
 (`scope` = 'EXECUTION' AND `executionStepId` IS NULL)
 OR (`scope` = 'STEP' AND `executionStepId` IS NOT NULL)
);
