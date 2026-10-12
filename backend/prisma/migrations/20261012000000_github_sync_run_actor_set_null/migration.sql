-- Preserve operational history if a User is physically removed. Account deletion
-- still follows the canonical anonymization policy; this does not enable hard delete.
-- Previous scheduler migrations have already been applied and must remain immutable.
ALTER TABLE `GitHubSyncRun`
  DROP FOREIGN KEY `GitHubSyncRun_requestedByUserId_fkey`;
ALTER TABLE `GitHubSyncRun`
  ADD CONSTRAINT `GitHubSyncRun_requestedByUserId_fkey`
  FOREIGN KEY (`requestedByUserId`) REFERENCES `User`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
