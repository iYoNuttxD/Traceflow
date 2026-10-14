CREATE UNIQUE INDEX `Sprint_id_projectId_key` ON `Sprint`(`id`, `projectId`);

ALTER TABLE `SprintBurnupEvent` DROP FOREIGN KEY `SprintBurnupEvent_sprintId_fkey`;
ALTER TABLE `SprintBurnupEvent` ADD CONSTRAINT `SprintBurnupEvent_sprintId_projectId_fkey`
  FOREIGN KEY (`sprintId`, `projectId`) REFERENCES `Sprint`(`id`, `projectId`)
  ON DELETE CASCADE ON UPDATE CASCADE;
