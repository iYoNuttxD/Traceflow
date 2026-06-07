-- AlterTable
ALTER TABLE `Project`
    ADD COLUMN `githubAutoSyncEnabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `githubLastSyncAt` DATETIME(3) NULL;
