-- PR #26, TF-REV-008 (ADR-022 D5 a D10): aviso de PR mesclada e de issue fechada sem tarefa para
-- os membros ativos. O alerta guarda a fila do aviso; os alertas que já existem ficam
-- NOT_APPLICABLE, sem aviso retroativo. O aviso não tem tarefa, então taskTitle passa a aceitar nulo.

-- AlterTable
ALTER TABLE `TraceabilityAlert` ADD COLUMN `noticeState` ENUM('PENDING', 'DISPATCHED', 'NOT_APPLICABLE') NOT NULL DEFAULT 'NOT_APPLICABLE',
    ADD COLUMN `noticedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `Notification` ADD COLUMN `batchSummary` JSON NULL,
    ADD COLUMN `traceabilityAlertId` INTEGER NULL,
    MODIFY `type` ENUM('TASK_STATUS_CHANGED', 'TASK_OVERDUE', 'ISSUE_EVENT', 'PULL_REQUEST_EVENT', 'TRACEABILITY_INCONSISTENCY') NOT NULL,
    MODIFY `taskTitle` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `NotificationPreference` MODIFY `type` ENUM('TASK_STATUS_CHANGED', 'TASK_OVERDUE', 'ISSUE_EVENT', 'PULL_REQUEST_EVENT', 'TRACEABILITY_INCONSISTENCY') NOT NULL;

-- AlterTable
ALTER TABLE `NotificationDecision` MODIFY `type` ENUM('TASK_STATUS_CHANGED', 'TASK_OVERDUE', 'ISSUE_EVENT', 'PULL_REQUEST_EVENT', 'TRACEABILITY_INCONSISTENCY') NOT NULL;

-- CreateIndex
CREATE INDEX `TraceabilityAlert_noticeState_projectId_detectedAt_idx` ON `TraceabilityAlert`(`noticeState`, `projectId`, `detectedAt`);

-- CreateIndex
CREATE INDEX `Notification_traceabilityAlertId_idx` ON `Notification`(`traceabilityAlertId`);

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_traceabilityAlertId_fkey` FOREIGN KEY (`traceabilityAlertId`) REFERENCES `TraceabilityAlert`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

