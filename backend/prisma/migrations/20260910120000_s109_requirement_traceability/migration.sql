CREATE TABLE `RequirementTraceabilityState` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `requirementId` INTEGER NOT NULL,
  `currentSituation` VARCHAR(32) NOT NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `RequirementTraceabilityState_requirementId_key` (`requirementId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `RequirementTraceabilityHistoryEntry` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `projectId` INTEGER NOT NULL,
  `requirementId` INTEGER NOT NULL,
  `fromSituation` VARCHAR(32) NULL,
  `toSituation` VARCHAR(32) NOT NULL,
  `reason` VARCHAR(64) NOT NULL,
  `sourceEntityType` VARCHAR(32) NULL,
  `sourceEntityId` INTEGER NULL,
  `metadataJson` JSON NULL,
  `occurredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `RequirementTraceabilityHistory_cursor_idx` (`projectId`, `requirementId`, `occurredAt`, `id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `RequirementTraceabilityState` ADD CONSTRAINT `RequirementTraceabilityState_requirementId_fkey` FOREIGN KEY (`requirementId`) REFERENCES `Requirement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `RequirementTraceabilityHistoryEntry` ADD CONSTRAINT `RequirementTraceabilityHistoryEntry_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX `TestExecution_current_version_latest_idx` ON `TestExecution` (`testCaseId`, `testCaseVersion`, `executedAt`, `id`);
