-- Correct L1 cardinality without changing the already-applied L1 migration.
-- One installation may serve many project integrations, while a repository remains exclusive.
ALTER TABLE `ProjectGitHubIntegration`
  DROP INDEX `ProjectGitHubIntegration_projectId_githubRepositoryId_key`,
  DROP INDEX `ProjectGitHubIntegration_githubRepositoryId_idx`,
  ADD UNIQUE INDEX `ProjectGitHubIntegration_githubRepositoryId_key`(`githubRepositoryId`);
