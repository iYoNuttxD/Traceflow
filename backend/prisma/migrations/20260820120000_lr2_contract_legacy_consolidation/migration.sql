-- LR.2 expands the canonical GitHub integration, reconciles legacy aliases and only then
-- contracts obsolete structures. Guards fail with a duplicate key before destructive DDL.

ALTER TABLE `ProjectGitHubIntegration`
  ADD COLUMN `repositoryPrivate` BOOLEAN NULL,
  ADD COLUMN `integratedAt` DATETIME(3) NULL,
  ADD COLUMN `autoSyncEnabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `lastSyncAttemptAt` DATETIME(3) NULL;

UPDATE `ProjectGitHubIntegration` AS `integration`
INNER JOIN `Project` AS `project` ON `project`.`id` = `integration`.`projectId`
SET
  `integration`.`githubRepositoryId` = COALESCE(`integration`.`githubRepositoryId`, `project`.`githubRepositoryId`),
  `integration`.`repositoryName` = COALESCE(`integration`.`repositoryName`, `project`.`githubRepositoryName`, `project`.`githubRepo`),
  `integration`.`repositoryFullName` = COALESCE(
    `integration`.`repositoryFullName`,
    `project`.`githubRepositoryFullName`,
    CASE
      WHEN `project`.`githubOwner` IS NOT NULL AND COALESCE(`project`.`githubRepositoryName`, `project`.`githubRepo`) IS NOT NULL
      THEN CONCAT(`project`.`githubOwner`, '/', COALESCE(`project`.`githubRepositoryName`, `project`.`githubRepo`))
      ELSE NULL
    END
  ),
  `integration`.`repositoryUrl` = COALESCE(`integration`.`repositoryUrl`, `project`.`githubRepositoryUrl`, `project`.`githubUrl`),
  `integration`.`defaultBranch` = COALESCE(`integration`.`defaultBranch`, `project`.`githubDefaultBranch`),
  `integration`.`repositoryPrivate` = COALESCE(`project`.`githubIsPrivate`, `integration`.`repositoryPrivate`),
  `integration`.`integratedAt` = COALESCE(`project`.`githubIntegratedAt`, `integration`.`integratedAt`),
  `integration`.`autoSyncEnabled` = `project`.`githubAutoSyncEnabled`,
  `integration`.`lastSyncAt` = COALESCE(`project`.`githubLastSyncAt`, `integration`.`lastSyncAt`),
  `integration`.`lastSyncStatus` = COALESCE(`project`.`githubSyncStatus`, `integration`.`lastSyncStatus`),
  `integration`.`lastSyncError` = COALESCE(`project`.`githubLastSyncError`, `integration`.`lastSyncError`),
  `integration`.`lastSyncAttemptAt` = `project`.`githubLastSyncAttemptAt`;

INSERT INTO `ProjectGitHubIntegration` (
  `projectId`, `installationId`, `githubRepositoryId`, `repositoryName`, `repositoryFullName`,
  `repositoryUrl`, `defaultBranch`, `repositoryPrivate`, `integratedAt`, `autoSyncEnabled`,
  `status`, `lastValidatedAt`, `lastSyncAt`, `lastSyncStatus`, `lastSyncError`,
  `lastSyncAttemptAt`, `createdAt`, `updatedAt`
)
SELECT
  `project`.`id`, NULL, `project`.`githubRepositoryId`,
  COALESCE(`project`.`githubRepositoryName`, `project`.`githubRepo`),
  COALESCE(
    `project`.`githubRepositoryFullName`,
    CONCAT(`project`.`githubOwner`, '/', COALESCE(`project`.`githubRepositoryName`, `project`.`githubRepo`))
  ),
  COALESCE(`project`.`githubRepositoryUrl`, `project`.`githubUrl`),
  `project`.`githubDefaultBranch`, `project`.`githubIsPrivate`, `project`.`githubIntegratedAt`,
  `project`.`githubAutoSyncEnabled`, 'RECONNECT_REQUIRED', NULL, `project`.`githubLastSyncAt`,
  `project`.`githubSyncStatus`, `project`.`githubLastSyncError`, `project`.`githubLastSyncAttemptAt`,
  COALESCE(`project`.`githubIntegratedAt`, `project`.`createdAt`), CURRENT_TIMESTAMP(3)
FROM `Project` AS `project`
LEFT JOIN `ProjectGitHubIntegration` AS `integration` ON `integration`.`projectId` = `project`.`id`
WHERE `integration`.`id` IS NULL
  AND `project`.`githubOwner` IS NOT NULL
  AND COALESCE(`project`.`githubRepositoryName`, `project`.`githubRepo`) IS NOT NULL
  AND COALESCE(`project`.`githubRepositoryUrl`, `project`.`githubUrl`) IS NOT NULL;

DROP TABLE IF EXISTS `_LR2ProjectMemberContractGuard`;
CREATE TABLE `_LR2ProjectMemberContractGuard` (`id` INTEGER NOT NULL, PRIMARY KEY (`id`));
INSERT INTO `_LR2ProjectMemberContractGuard` (`id`) VALUES (1);
INSERT INTO `_LR2ProjectMemberContractGuard` (`id`)
SELECT 1 FROM `ProjectMember` LIMIT 1;
INSERT INTO `_LR2ProjectMemberContractGuard` (`id`)
SELECT 1 FROM `TaskMovement` WHERE `projectMemberId` IS NOT NULL LIMIT 1;
DROP TABLE `_LR2ProjectMemberContractGuard`;

DROP TABLE IF EXISTS `_LR2CommitBranchContractGuard`;
CREATE TABLE `_LR2CommitBranchContractGuard` (`id` INTEGER NOT NULL, PRIMARY KEY (`id`));
INSERT INTO `_LR2CommitBranchContractGuard` (`id`) VALUES (1);
INSERT INTO `_LR2CommitBranchContractGuard` (`id`)
SELECT 1
FROM `Commit` AS `commit`
WHERE `commit`.`branch` IS NOT NULL
  AND TRIM(`commit`.`branch`) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM `CommitBranch` AS `link`
    INNER JOIN `GitBranch` AS `branch` ON `branch`.`id` = `link`.`branchId`
    WHERE `link`.`commitId` = `commit`.`id` AND `branch`.`name` = `commit`.`branch`
  )
LIMIT 1;
DROP TABLE `_LR2CommitBranchContractGuard`;

DROP TABLE IF EXISTS `_LR2GithubIntegrationContractGuard`;
CREATE TABLE `_LR2GithubIntegrationContractGuard` (`id` INTEGER NOT NULL, PRIMARY KEY (`id`));
INSERT INTO `_LR2GithubIntegrationContractGuard` (`id`) VALUES (1);
INSERT INTO `_LR2GithubIntegrationContractGuard` (`id`)
SELECT 1
FROM `Project` AS `project`
LEFT JOIN `ProjectGitHubIntegration` AS `integration` ON `integration`.`projectId` = `project`.`id`
WHERE (
    `project`.`githubRepositoryId` IS NOT NULL OR
    `project`.`githubRepositoryFullName` IS NOT NULL OR
    `project`.`githubOwner` IS NOT NULL OR
    `project`.`githubRepo` IS NOT NULL OR
    `project`.`githubUrl` IS NOT NULL
  )
  AND (
    `integration`.`id` IS NULL OR
    `integration`.`repositoryName` IS NULL OR
    `integration`.`repositoryFullName` IS NULL OR
    `integration`.`repositoryUrl` IS NULL
  )
LIMIT 1;
DROP TABLE `_LR2GithubIntegrationContractGuard`;

ALTER TABLE `TaskMovement` DROP FOREIGN KEY `TaskMovement_projectMemberId_fkey`;
DROP INDEX `TaskMovement_projectMemberId_idx` ON `TaskMovement`;
ALTER TABLE `TaskMovement` DROP COLUMN `projectMemberId`;
DROP TABLE `ProjectMember`;

ALTER TABLE `Commit` DROP COLUMN `branch`;

DROP INDEX `Project_githubRepositoryId_key` ON `Project`;
DROP INDEX `Project_githubRepositoryFullName_key` ON `Project`;
DROP INDEX `Project_githubSyncStatus_idx` ON `Project`;
ALTER TABLE `Project`
  DROP COLUMN `githubOwner`,
  DROP COLUMN `githubRepo`,
  DROP COLUMN `githubUrl`,
  DROP COLUMN `githubRepositoryId`,
  DROP COLUMN `githubRepositoryName`,
  DROP COLUMN `githubRepositoryFullName`,
  DROP COLUMN `githubRepositoryUrl`,
  DROP COLUMN `githubDefaultBranch`,
  DROP COLUMN `githubIsPrivate`,
  DROP COLUMN `githubIntegratedAt`,
  DROP COLUMN `githubAutoSyncEnabled`,
  DROP COLUMN `githubLastSyncAt`,
  DROP COLUMN `githubSyncStatus`,
  DROP COLUMN `githubLastSyncError`,
  DROP COLUMN `githubLastSyncAttemptAt`,
  DROP COLUMN `inviteLink`;
