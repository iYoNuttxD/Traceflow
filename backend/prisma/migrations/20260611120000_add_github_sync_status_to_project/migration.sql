-- Persist the latest GitHub sync attempt result for project details.
ALTER TABLE `Project`
ADD COLUMN `githubSyncStatus` VARCHAR(191) NULL,
ADD COLUMN `githubLastSyncError` VARCHAR(255) NULL,
ADD COLUMN `githubLastSyncAttemptAt` DATETIME(3) NULL;
