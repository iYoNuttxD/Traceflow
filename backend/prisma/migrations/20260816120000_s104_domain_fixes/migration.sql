-- S1-04 (correcao do dominio): participacao historica, marco por sprint e instantes exatos.
--
-- Migration aditiva em relacao a 20260805120000_add_sprint_milestone_schedule:
-- nenhuma tabela e removida e nenhuma coluna existente perde dado. As colunas de
-- data mudam de DATE para DATETIME(3), o que amplia a precisao em vez de reduzi-la.

-- 1. Datas de cronograma passam a guardar o instante exato (ADR-010 D05).
--    A conversao DATE -> DATETIME preenche 00:00:00.000; nenhuma linha se perde.
ALTER TABLE `Sprint`
  MODIFY COLUMN `startDate` DATETIME(3) NOT NULL,
  MODIFY COLUMN `endDate`   DATETIME(3) NOT NULL;

ALTER TABLE `Milestone`
  MODIFY COLUMN `dueDate` DATETIME(3) NOT NULL;

-- Indice novo: a validacao de sobreposicao (D03) filtra por projeto e fim de janela.
CREATE INDEX `Sprint_projectId_endDate_idx` ON `Sprint`(`projectId`, `endDate`);

-- 2. Participacao historica de tarefa em sprint (ADR-010 D01/D09).
CREATE TABLE `SprintTask` (
  `id`                  INTEGER NOT NULL AUTO_INCREMENT,
  `projectId`           INTEGER NOT NULL,
  `sprintId`            INTEGER NOT NULL,
  `taskId`              INTEGER NULL,
  `taskTitleSnapshot`   VARCHAR(191) NOT NULL,
  `addedAt`             DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `addedAfterStart`     BOOLEAN NOT NULL DEFAULT false,
  `carriedFromSprintId` INTEGER NULL,
  `removedAt`           DATETIME(3) NULL,
  `removalReason`       ENUM('MOVIDA', 'REMOVIDA', 'TAREFA_EXCLUIDA') NULL,
  `exitStatus`          VARCHAR(191) NULL,
  `closedAt`            DATETIME(3) NULL,

  UNIQUE INDEX `SprintTask_sprintId_taskId_key`(`sprintId`, `taskId`),
  INDEX `SprintTask_sprintId_removedAt_idx`(`sprintId`, `removedAt`),
  INDEX `SprintTask_taskId_removedAt_idx`(`taskId`, `removedAt`),
  INDEX `SprintTask_carriedFromSprintId_idx`(`carriedFromSprintId`),
  INDEX `SprintTask_projectId_addedAt_idx`(`projectId`, `addedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Backfill a partir do vinculo atual. `addedAfterStart = false` e premissa
-- explicita: para dados anteriores a esta regra nao existe evidencia de inclusao
-- pos-inicio, e assumir o contrario inventaria mudanca de escopo que ninguem fez.
INSERT INTO `SprintTask`
  (`projectId`, `sprintId`, `taskId`, `taskTitleSnapshot`, `addedAt`, `addedAfterStart`)
SELECT t.`projectId`, t.`sprintId`, t.`id`, t.`title`, t.`createdAt`, false
FROM `Task` t
WHERE t.`sprintId` IS NOT NULL;

ALTER TABLE `SprintTask`
  ADD CONSTRAINT `SprintTask_projectId_fkey`
    FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `SprintTask_sprintId_fkey`
    FOREIGN KEY (`sprintId`) REFERENCES `Sprint`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `SprintTask_taskId_fkey`
    FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `SprintTask_carriedFromSprintId_fkey`
    FOREIGN KEY (`carriedFromSprintId`) REFERENCES `Sprint`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. Marco pertence a uma sprint (ADR-010 D02).
--    Tres etapas obrigatorias: coluna nula, backfill, NOT NULL. Criar a coluna ja
--    NOT NULL sem DEFAULT falharia em qualquer tabela com linhas.
ALTER TABLE `Milestone` ADD COLUMN `sprintId` INTEGER NULL;

-- Primeira tentativa: a sprint cuja janela contem a data prevista do marco.
UPDATE `Milestone` m
SET m.`sprintId` = (
  SELECT s.`id` FROM `Sprint` s
  WHERE s.`projectId` = m.`projectId`
    AND m.`dueDate` >= s.`startDate`
    AND m.`dueDate` <  s.`endDate`
  ORDER BY s.`startDate` ASC
  LIMIT 1
)
WHERE m.`sprintId` IS NULL;

-- Fallback: ultima sprint do projeto, quando a data nao cai em nenhuma janela.
UPDATE `Milestone` m
SET m.`sprintId` = (
  SELECT s.`id` FROM `Sprint` s
  WHERE s.`projectId` = m.`projectId`
  ORDER BY s.`startDate` DESC
  LIMIT 1
)
WHERE m.`sprintId` IS NULL;

-- Guarda: em modo estrito, esta linha FALHA se algum marco continuar sem sprint
-- (projeto com marco e sem nenhuma sprint). A falha e desejada — vincular a uma
-- sprint arbitraria seria inventar historico. Ver o README desta migration.
ALTER TABLE `Milestone`
  MODIFY COLUMN `sprintId` INTEGER NOT NULL;

CREATE INDEX `Milestone_sprintId_status_idx` ON `Milestone`(`sprintId`, `status`);

ALTER TABLE `Milestone`
  ADD CONSTRAINT `Milestone_sprintId_fkey`
  FOREIGN KEY (`sprintId`) REFERENCES `Sprint`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
