-- L5.1: every project receives one cryptographically strong active access code.
-- Existing legacy codes are intentionally rotated because earlier versions generated
-- predictable or low-entropy capabilities. Stored invite links are cleared so the
-- application can rebuild them from the current FRONTEND_URL and active code.
ALTER TABLE `Project`
  ADD COLUMN `accessCodeRole` ENUM('OWNER', 'MANAGER', 'MEMBER', 'VIEWER') NOT NULL DEFAULT 'MEMBER';

UPDATE `Project`
SET
  `accessCode` = CONCAT('TRC-', UPPER(HEX(RANDOM_BYTES(16)))),
  `inviteLink` = NULL;

ALTER TABLE `Project`
  MODIFY `accessCode` VARCHAR(191) NOT NULL;

ALTER TABLE `Project`
  ADD CONSTRAINT `Project_accessCodeRole_allowed`
  CHECK (`accessCodeRole` IN ('MEMBER', 'VIEWER'));
