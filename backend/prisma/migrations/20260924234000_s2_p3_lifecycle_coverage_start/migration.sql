-- First completed lifecycle scan establishes a conservative prospective lower bound.
-- Existing integrations remain unknown until their next full scan; no historical backfill is inferred.
ALTER TABLE `ProjectGitHubIntegration`
  ADD COLUMN `pullRequestLifecycleCoverageFrom` DATETIME(3) NULL;
