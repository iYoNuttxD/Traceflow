-- Preserve unknown legacy facts; new movements explicitly capture assignment state.
ALTER TABLE `TaskMovement` ADD COLUMN `responsibilitySnapshotState` ENUM('ASSIGNED', 'UNASSIGNED') NULL;
