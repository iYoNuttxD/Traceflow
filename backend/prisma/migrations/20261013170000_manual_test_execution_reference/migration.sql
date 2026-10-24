-- Extend the immutable execution reference without manufacturing a GitHub entity.
-- Existing PR/Commit rows and their foreign keys remain unchanged.
ALTER TABLE `TestExecution`
  DROP CHECK `TestExecution_primary_reference_check`,
  MODIFY `testedReferenceType` ENUM('PULL_REQUEST', 'COMMIT', 'MANUAL') NOT NULL,
  ADD CONSTRAINT `TestExecution_primary_reference_check` CHECK (
 (`testedReferenceType` = 'PULL_REQUEST' AND `testedPullRequestId` IS NOT NULL AND `testedCommitId` IS NULL)
 OR (`testedReferenceType` = 'COMMIT' AND `testedCommitId` IS NOT NULL AND `testedPullRequestId` IS NULL)
 OR (`testedReferenceType` = 'MANUAL' AND `testedPullRequestId` IS NULL AND `testedCommitId` IS NULL)
);
