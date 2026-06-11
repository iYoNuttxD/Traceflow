-- Add optional RF09 relation from Task to imported PullRequest.
ALTER TABLE `Task` ADD COLUMN `pullRequestId` INTEGER NULL;

CREATE INDEX `Task_pullRequestId_idx` ON `Task`(`pullRequestId`);

ALTER TABLE `Task`
ADD CONSTRAINT `Task_pullRequestId_fkey`
FOREIGN KEY (`pullRequestId`) REFERENCES `PullRequest`(`id`)
ON DELETE SET NULL ON UPDATE CASCADE;
