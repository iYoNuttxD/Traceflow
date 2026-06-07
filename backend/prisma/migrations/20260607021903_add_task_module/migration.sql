-- Preserve tasks created before RF07 defined a default priority.
UPDATE `task`
SET `priority` = 'MEDIA'
WHERE `priority` IS NULL;

-- AlterTable
ALTER TABLE `task` ADD COLUMN `responsible` VARCHAR(191) NULL,
    MODIFY `priority` VARCHAR(191) NOT NULL DEFAULT 'MEDIA';
