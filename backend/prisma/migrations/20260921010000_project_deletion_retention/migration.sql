-- Project deletion lifecycle: 30-day recovery window plus a durable storage-cleanup journal.
ALTER TABLE `Project`
  ADD COLUMN `deletedAt` DATETIME(3) NULL,
  ADD COLUMN `deletionScheduledFor` DATETIME(3) NULL,
  ADD COLUMN `deletedById` INTEGER NULL,
  ADD COLUMN `purgeStartedAt` DATETIME(3) NULL;

CREATE INDEX `Project_deletedAt_idx` ON `Project`(`deletedAt`);
CREATE INDEX `Project_deletionScheduledFor_idx` ON `Project`(`deletionScheduledFor`);
CREATE INDEX `Project_deletedById_idx` ON `Project`(`deletedById`);
CREATE INDEX `Project_purgeStartedAt_idx` ON `Project`(`purgeStartedAt`);

ALTER TABLE `Project`
  ADD CONSTRAINT `Project_deletedById_fkey`
  FOREIGN KEY (`deletedById`) REFERENCES `User`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `ProjectPurgeStorageCleanup` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `projectId` INTEGER NOT NULL,
  `storageKey` VARCHAR(100) NOT NULL,
  `purgeKey` VARCHAR(100) NOT NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `lastError` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `ProjectPurgeStorageCleanup_storageKey_key`(`storageKey`),
  UNIQUE INDEX `ProjectPurgeStorageCleanup_purgeKey_key`(`purgeKey`),
  INDEX `ProjectPurgeStorageCleanup_projectId_status_idx`(`projectId`, `status`),
  INDEX `ProjectPurgeStorageCleanup_status_updatedAt_idx`(`status`, `updatedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
