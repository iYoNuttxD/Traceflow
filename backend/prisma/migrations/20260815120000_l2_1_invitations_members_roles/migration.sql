-- L2.1: preserve invitation refusal history and support project/e-mail lifecycle queries.
ALTER TABLE `ProjectInvitation`
  ADD COLUMN `declinedAt` DATETIME(3) NULL,
  ADD COLUMN `declinedById` INTEGER NULL;

CREATE INDEX `ProjectInvitation_projectId_email_createdAt_idx`
  ON `ProjectInvitation`(`projectId`, `email`, `createdAt`);
CREATE INDEX `ProjectInvitation_declinedById_idx`
  ON `ProjectInvitation`(`declinedById`);

ALTER TABLE `ProjectInvitation`
  ADD CONSTRAINT `ProjectInvitation_declinedById_fkey`
  FOREIGN KEY (`declinedById`) REFERENCES `User`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
