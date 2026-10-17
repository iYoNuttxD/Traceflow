-- PR #26, segunda revisão (TF-REV-002, ADR-023 D4): período de cada vínculo de tarefa com issue
-- ou pull request, para valer o vínculo no instante do evento do GitHub.

-- CreateTable
CREATE TABLE `TaskArtifactLinkPeriod` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `projectId` INTEGER NOT NULL,
    `taskId` INTEGER NULL,
    `issueId` INTEGER NULL,
    `pullRequestId` INTEGER NULL,
    `linkedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `unlinkedAt` DATETIME(3) NULL,

    INDEX `TaskArtifactLinkPeriod_projectId_issueId_linkedAt_idx`(`projectId`, `issueId`, `linkedAt`),
    INDEX `TaskArtifactLinkPeriod_projectId_pullRequestId_linkedAt_idx`(`projectId`, `pullRequestId`, `linkedAt`),
    INDEX `TaskArtifactLinkPeriod_taskId_unlinkedAt_idx`(`taskId`, `unlinkedAt`),
    INDEX `TaskArtifactLinkPeriod_issueId_idx`(`issueId`),
    INDEX `TaskArtifactLinkPeriod_pullRequestId_idx`(`pullRequestId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `TaskArtifactLinkPeriod` ADD CONSTRAINT `TaskArtifactLinkPeriod_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskArtifactLinkPeriod` ADD CONSTRAINT `TaskArtifactLinkPeriod_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskArtifactLinkPeriod` ADD CONSTRAINT `TaskArtifactLinkPeriod_issueId_fkey` FOREIGN KEY (`issueId`) REFERENCES `Issue`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskArtifactLinkPeriod` ADD CONSTRAINT `TaskArtifactLinkPeriod_pullRequestId_fkey` FOREIGN KEY (`pullRequestId`) REFERENCES `PullRequest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Carga inicial: cada vínculo existente abre um período. A issue usa a data do vínculo
-- (TaskIssue.createdAt); a PR, cujo vínculo antigo não tem data, usa o instante desta migration.
INSERT INTO `TaskArtifactLinkPeriod` (`projectId`, `taskId`, `issueId`, `linkedAt`)
SELECT `Task`.`projectId`, `TaskIssue`.`taskId`, `TaskIssue`.`issueId`, `TaskIssue`.`createdAt`
FROM `TaskIssue`
INNER JOIN `Task` ON `Task`.`id` = `TaskIssue`.`taskId`;

INSERT INTO `TaskArtifactLinkPeriod` (`projectId`, `taskId`, `pullRequestId`, `linkedAt`)
SELECT `projectId`, `id`, `pullRequestId`, UTC_TIMESTAMP(3)
FROM `Task`
WHERE `pullRequestId` IS NOT NULL;
