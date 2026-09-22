-- Claim tokens fence stale workers and keep terminal storage cleanup retryable.
ALTER TABLE `Project`
  ADD COLUMN `purgeClaimId` VARCHAR(36) NULL;

CREATE INDEX `Project_purgeClaimId_idx` ON `Project`(`purgeClaimId`);

ALTER TABLE `ProjectPurgeStorageCleanup`
  ADD COLUMN `claimToken` VARCHAR(36) NULL,
  ADD COLUMN `claimedAt` DATETIME(3) NULL;

CREATE INDEX `ProjectPurgeStorageCleanup_status_claimToken_claimedAt_idx`
  ON `ProjectPurgeStorageCleanup`(`status`, `claimToken`, `claimedAt`);
