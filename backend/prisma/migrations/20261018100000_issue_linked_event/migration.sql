-- PR #26, terceira revisão (TF-REV-002, ADR-023 D6): a associação de issue aberta (ISSUE_LINKED)
-- substitui o ISSUE_OPENED. O valor novo entra, as linhas mudam, e só então o valor antigo sai.

-- AlterTable
ALTER TABLE `Notification` MODIFY `githubEvent` ENUM('ISSUE_CLOSED', 'ISSUE_REOPENED', 'PULL_REQUEST_MERGED', 'PULL_REQUEST_CLOSED', 'ISSUE_OPENED', 'ISSUE_LINKED') NULL;

-- AlterTable
ALTER TABLE `GitHubArtifactEvent` MODIFY `type` ENUM('ISSUE_CLOSED', 'ISSUE_REOPENED', 'PULL_REQUEST_MERGED', 'PULL_REQUEST_CLOSED', 'ISSUE_OPENED', 'ISSUE_LINKED') NOT NULL;

UPDATE `GitHubArtifactEvent`
SET `type` = 'ISSUE_LINKED',
    `occurredAt` = `detectedAt`,
    `occurrenceKey` = IF(`occurrenceKey` LIKE 'opened:%', CONCAT('linked:', SUBSTRING(`occurrenceKey`, 8)), `occurrenceKey`)
WHERE `type` = 'ISSUE_OPENED';

UPDATE `Notification` AS n
JOIN `GitHubArtifactEvent` AS e
  ON e.`id` = CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(n.`dedupeKey`, ':', 3), ':', -1) AS UNSIGNED)
SET n.`githubEvent` = 'ISSUE_LINKED',
    n.`githubOccurredAt` = e.`occurredAt`
WHERE n.`githubEvent` = 'ISSUE_OPENED'
  AND n.`dedupeKey` LIKE 'ISSUE_EVENT:event:%';

UPDATE `Notification` SET `githubEvent` = 'ISSUE_LINKED' WHERE `githubEvent` = 'ISSUE_OPENED';

-- AlterTable
ALTER TABLE `Notification` MODIFY `githubEvent` ENUM('ISSUE_CLOSED', 'ISSUE_REOPENED', 'PULL_REQUEST_MERGED', 'PULL_REQUEST_CLOSED', 'ISSUE_LINKED') NULL;

-- AlterTable
ALTER TABLE `GitHubArtifactEvent` MODIFY `type` ENUM('ISSUE_CLOSED', 'ISSUE_REOPENED', 'PULL_REQUEST_MERGED', 'PULL_REQUEST_CLOSED', 'ISSUE_LINKED') NOT NULL;
