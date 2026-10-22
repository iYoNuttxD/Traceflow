-- S2-02 (RF30, RF59, ADR-016): notificações de tarefa por destinatário e preferências por tipo.
-- A deduplicação é do banco: UNIQUE (recipientUserId, dedupeKey).

-- CreateTable
CREATE TABLE `Notification` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `recipientUserId` INTEGER NOT NULL,
    `projectId` INTEGER NOT NULL,
    `taskId` INTEGER NULL,
    `type` ENUM('TASK_STATUS_CHANGED', 'TASK_OVERDUE') NOT NULL,
    `dedupeKey` VARCHAR(96) NOT NULL,
    `taskTitle` VARCHAR(191) NOT NULL,
    `fromStatus` VARCHAR(32) NULL,
    `toStatus` VARCHAR(32) NULL,
    `actorUserId` INTEGER NULL,
    `dueDate` DATE NULL,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notification_recipientUserId_readAt_createdAt_idx`(`recipientUserId`, `readAt`, `createdAt`),
    INDEX `Notification_projectId_idx`(`projectId`),
    INDEX `Notification_taskId_idx`(`taskId`),
    INDEX `Notification_actorUserId_idx`(`actorUserId`),
    INDEX `Notification_createdAt_idx`(`createdAt`),
    UNIQUE INDEX `Notification_recipientUserId_dedupeKey_key`(`recipientUserId`, `dedupeKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NotificationPreference` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `type` ENUM('TASK_STATUS_CHANGED', 'TASK_OVERDUE') NOT NULL,
    `enabled` BOOLEAN NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `NotificationPreference_userId_type_key`(`userId`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_recipientUserId_fkey` FOREIGN KEY (`recipientUserId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NotificationPreference` ADD CONSTRAINT `NotificationPreference_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
