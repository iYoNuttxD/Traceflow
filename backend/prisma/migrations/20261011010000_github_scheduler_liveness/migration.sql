CREATE TABLE `GitHubSchedulerWorker` (
  `id` CHAR(36) NOT NULL,
  `heartbeatAt` DATETIME(3) NOT NULL,
  INDEX `GitHubSchedulerWorker_heartbeatAt_idx` (`heartbeatAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
