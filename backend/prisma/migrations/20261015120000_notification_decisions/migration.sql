-- PR #26, TF-REV-002 (ADR-016 D11, NOTIFICATION_METRICS.md): decisão de cada avaliação do RF30 e
-- do RF59 por evento e destinatário, base da métrica oficial. recipientKey é o destinatário, 0
-- quando não há responsável, e -id depois da anonimização, para a unicidade valer sem destinatário.

-- CreateTable
CREATE TABLE `NotificationDecision` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` ENUM('TASK_STATUS_CHANGED', 'TASK_OVERDUE', 'ISSUE_EVENT', 'PULL_REQUEST_EVENT') NOT NULL,
    `eventKey` VARCHAR(96) NOT NULL,
    `projectId` INTEGER NOT NULL,
    `recipientUserId` INTEGER NULL,
    `recipientKey` INTEGER NOT NULL,
    `outcome` ENUM('SENT', 'NO_RESPONSIBLE', 'INACTIVE_ACCOUNT', 'INACTIVE_MEMBER', 'PREFERENCE_OFF') NOT NULL,
    `occurredAt` DATETIME(3) NOT NULL,
    `decidedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `NotificationDecision_projectId_type_occurredAt_idx`(`projectId`, `type`, `occurredAt`),
    INDEX `NotificationDecision_recipientUserId_idx`(`recipientUserId`),
    INDEX `NotificationDecision_decidedAt_idx`(`decidedAt`),
    UNIQUE INDEX `NotificationDecision_type_eventKey_recipientKey_key`(`type`, `eventKey`, `recipientKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `NotificationDecision` ADD CONSTRAINT `NotificationDecision_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NotificationDecision` ADD CONSTRAINT `NotificationDecision_recipientUserId_fkey` FOREIGN KEY (`recipientUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

