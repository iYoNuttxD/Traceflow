-- PR #26, segunda revisão (TF-REV-002, ADR-023 D1, D2 e D7): eventos de issue lidos do histórico
-- do repositório e cobertura da fonte durável por projeto.

-- CreateTable
CREATE TABLE `IssueLifecycleEvent` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `projectId` INTEGER NOT NULL,
    `issueId` INTEGER NOT NULL,
    `eventType` VARCHAR(16) NOT NULL,
    `occurredAt` DATETIME(3) NOT NULL,
    `providerEventId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `IssueLifecycleEvent_issueId_occurredAt_idx`(`issueId`, `occurredAt`),
    INDEX `IssueLifecycleEvent_projectId_occurredAt_idx`(`projectId`, `occurredAt`),
    UNIQUE INDEX `IssueLifecycleEvent_projectId_providerEventId_key`(`projectId`, `providerEventId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GitHubEventCoverage` (
    `projectId` INTEGER NOT NULL,
    `coverageFrom` DATETIME(3) NOT NULL,
    `comparedBefore` BOOLEAN NOT NULL DEFAULT false,
    `completeThrough` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`projectId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `IssueLifecycleEvent` ADD CONSTRAINT `IssueLifecycleEvent_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IssueLifecycleEvent` ADD CONSTRAINT `IssueLifecycleEvent_issueId_fkey` FOREIGN KEY (`issueId`) REFERENCES `Issue`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GitHubEventCoverage` ADD CONSTRAINT `GitHubEventCoverage_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Corte: nas integrações que já existem, a fonte durável começa no instante desta migration.
-- Antes dele, a fonte era a comparação de estado (comparedBefore).
INSERT INTO `GitHubEventCoverage` (`projectId`, `coverageFrom`, `comparedBefore`, `updatedAt`)
SELECT `projectId`, UTC_TIMESTAMP(3), true, UTC_TIMESTAMP(3)
FROM `ProjectGitHubIntegration`;
