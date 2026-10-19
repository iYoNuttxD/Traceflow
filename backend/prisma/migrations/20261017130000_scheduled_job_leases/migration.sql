-- PR #26, segunda revisão (TF-REV-006, ADR-024 D7): lease de cada job agendado do worker, com
-- dono e validade. A exclusão entre instâncias não usa GET_LOCK.

-- CreateTable
CREATE TABLE `ScheduledJobLease` (
    `name` VARCHAR(64) NOT NULL,
    `ownerId` VARCHAR(64) NOT NULL,
    `acquiredAt` DATETIME(3) NOT NULL,
    `leaseUntil` DATETIME(3) NOT NULL,

    PRIMARY KEY (`name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
