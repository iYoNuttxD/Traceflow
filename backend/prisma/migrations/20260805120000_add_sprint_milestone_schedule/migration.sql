-- S1-04/RF10: sprints, marcos e cronograma do projeto.
-- Migration aditiva: nenhuma tabela ou coluna existente e removida.

-- Novo valor no fim do enum de historico de tarefas.
-- Acrescentar ao final preserva as posicoes ordinais dos valores ja gravados,
-- de modo que nenhuma linha existente de TaskHistoryEntry e perdida ou reinterpretada.
ALTER TABLE `TaskHistoryEntry`
  MODIFY COLUMN `field` ENUM('STATUS', 'DEADLINE', 'RESPONSIBLE', 'PRIORITY', 'SPRINT') NOT NULL;

-- Sprint do cronograma do projeto.
CREATE TABLE `Sprint` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `projectId` INTEGER NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `objective` TEXT NULL,
  `startDate` DATE NOT NULL,
  `endDate` DATE NOT NULL,
  `status` ENUM('PLANEJADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA') NOT NULL DEFAULT 'PLANEJADA',
  `startedAt` DATETIME(3) NULL,
  `completedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `Sprint_projectId_name_key`(`projectId`, `name`),
  INDEX `Sprint_projectId_status_idx`(`projectId`, `status`),
  INDEX `Sprint_projectId_startDate_idx`(`projectId`, `startDate`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Marco do cronograma. Pertence ao projeto, nao a sprint.
CREATE TABLE `Milestone` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `projectId` INTEGER NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `dueDate` DATE NOT NULL,
  `status` ENUM('PENDENTE', 'CONCLUIDO') NOT NULL DEFAULT 'PENDENTE',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `Milestone_projectId_dueDate_idx`(`projectId`, `dueDate`),
  INDEX `Milestone_projectId_status_idx`(`projectId`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Vinculo opcional de tarefa a sprint.
ALTER TABLE `Task` ADD COLUMN `sprintId` INTEGER NULL;

CREATE INDEX `Task_projectId_sprintId_idx` ON `Task`(`projectId`, `sprintId`);

ALTER TABLE `Sprint`
  ADD CONSTRAINT `Sprint_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `Milestone`
  ADD CONSTRAINT `Milestone_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- SetNull e rede de seguranca contra cascata acidental, nao o caminho pretendido:
-- a exclusao de sprint com tarefas associadas e bloqueada no service.
ALTER TABLE `Task`
  ADD CONSTRAINT `Task_sprintId_fkey`
  FOREIGN KEY (`sprintId`) REFERENCES `Sprint`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
