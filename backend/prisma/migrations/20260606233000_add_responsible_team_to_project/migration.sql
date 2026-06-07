-- AlterTable
ALTER TABLE `Project`
    ADD COLUMN `responsibleTeam` VARCHAR(191) NULL;

-- Preserve projects created before RF01 required the responsible team.
UPDATE `Project`
SET `responsibleTeam` = 'Não informada'
WHERE `responsibleTeam` IS NULL;

ALTER TABLE `Project`
    MODIFY `responsibleTeam` VARCHAR(191) NOT NULL;
