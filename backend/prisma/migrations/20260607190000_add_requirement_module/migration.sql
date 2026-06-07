-- Backfill existing requirements before enforcing the RF15 default type.
UPDATE `Requirement`
SET `type` = 'FUNCIONAL'
WHERE `type` IS NULL OR `type` = '';

-- AlterTable
ALTER TABLE `Requirement` MODIFY `type` VARCHAR(191) NOT NULL DEFAULT 'FUNCIONAL';
