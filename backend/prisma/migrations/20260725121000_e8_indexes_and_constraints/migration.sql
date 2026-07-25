CREATE INDEX `Project_status_idx` ON `Project`(`status`);
CREATE INDEX `Project_githubSyncStatus_idx` ON `Project`(`githubSyncStatus`);
CREATE INDEX `Project_createdAt_idx` ON `Project`(`createdAt`);

CREATE INDEX `ProjectMembership_projectId_role_isActive_idx`
  ON `ProjectMembership`(`projectId`, `role`, `isActive`);
CREATE INDEX `ProjectMembership_userId_isActive_idx`
  ON `ProjectMembership`(`userId`, `isActive`);

CREATE INDEX `Requirement_projectId_status_idx` ON `Requirement`(`projectId`, `status`);
CREATE INDEX `Requirement_projectId_createdAt_idx` ON `Requirement`(`projectId`, `createdAt`);

CREATE INDEX `Task_requirementId_idx` ON `Task`(`requirementId`);
CREATE INDEX `Task_projectId_status_idx` ON `Task`(`projectId`, `status`);
CREATE INDEX `Task_projectId_createdAt_idx` ON `Task`(`projectId`, `createdAt`);

CREATE INDEX `TaskMovement_projectId_movedAt_idx` ON `TaskMovement`(`projectId`, `movedAt`);
CREATE INDEX `TaskMovement_taskId_movedAt_idx` ON `TaskMovement`(`taskId`, `movedAt`);

CREATE INDEX `GithubArtifact_projectId_importedAt_idx` ON `GithubArtifact`(`projectId`, `importedAt`);
CREATE INDEX `GithubArtifact_projectId_type_idx` ON `GithubArtifact`(`projectId`, `type`);

CREATE INDEX `TraceLink_projectId_createdAt_idx` ON `TraceLink`(`projectId`, `createdAt`);
CREATE INDEX `TraceLink_projectId_sourceType_sourceId_idx`
  ON `TraceLink`(`projectId`, `sourceType`, `sourceId`);
CREATE INDEX `TraceLink_projectId_targetType_targetId_idx`
  ON `TraceLink`(`projectId`, `targetType`, `targetId`);

CREATE INDEX `Commit_projectId_date_idx` ON `Commit`(`projectId`, `date`);
CREATE INDEX `Commit_projectId_createdAt_idx` ON `Commit`(`projectId`, `createdAt`);
CREATE INDEX `PullRequest_projectId_createdAtGithub_idx`
  ON `PullRequest`(`projectId`, `createdAtGithub`);
CREATE INDEX `PullRequest_projectId_updatedAtGithub_idx`
  ON `PullRequest`(`projectId`, `updatedAtGithub`);
CREATE INDEX `Issue_projectId_createdAtGithub_idx` ON `Issue`(`projectId`, `createdAtGithub`);
CREATE INDEX `Issue_projectId_updatedAtGithub_idx` ON `Issue`(`projectId`, `updatedAtGithub`);

ALTER TABLE `Requirement` DROP FOREIGN KEY `Requirement_projectId_fkey`;
ALTER TABLE `Requirement`
  ADD CONSTRAINT `Requirement_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
