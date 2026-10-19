-- PR #26, segunda revisão (TF-REV-002, ADR-023 D6): abertura de issue vinculada no RF60. O valor
-- novo entra no fim do enum, sem reordenar os existentes.

-- AlterTable
ALTER TABLE `Notification` MODIFY `githubEvent` ENUM('ISSUE_CLOSED', 'ISSUE_REOPENED', 'PULL_REQUEST_MERGED', 'PULL_REQUEST_CLOSED', 'ISSUE_OPENED') NULL;

-- AlterTable
ALTER TABLE `GitHubArtifactEvent` MODIFY `type` ENUM('ISSUE_CLOSED', 'ISSUE_REOPENED', 'PULL_REQUEST_MERGED', 'PULL_REQUEST_CLOSED', 'ISSUE_OPENED') NOT NULL;
