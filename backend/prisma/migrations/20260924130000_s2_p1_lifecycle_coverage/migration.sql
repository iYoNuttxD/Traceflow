-- A completed empty scan must be distinguishable from a project never scanned.
ALTER TABLE `ProjectGitHubIntegration` ADD COLUMN `pullRequestLifecycleSyncedAt` DATETIME(3) NULL;
