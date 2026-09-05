-- No retrospective backfill: current Task values cannot establish historical truth.
ALTER TABLE `Sprint`
  ADD COLUMN `planningSnapshotAt` DATETIME(3) NULL,
  ADD COLUMN `closedAt` DATETIME(3) NULL;
ALTER TABLE `SprintTask`
  ADD COLUMN `plannedAtStart` BOOLEAN NULL,
  ADD COLUMN `pointsAtPlanning` INTEGER NULL,
  ADD COLUMN `pointsAtClose` INTEGER NULL,
  ADD COLUMN `completedAtClose` DATETIME(3) NULL;
