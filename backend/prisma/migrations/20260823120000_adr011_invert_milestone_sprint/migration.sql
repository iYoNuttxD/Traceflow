-- ADR-011: inversao do vinculo Marco <-> Sprint.
--
-- Antes: Milestone.sprintId NOT NULL — o marco pertencia a UMA sprint.
-- Depois: Sprint.milestoneId NULL — o marco AGRUPA sprints e e concluido
-- automaticamente quando todas as suas sprints nao canceladas terminam.
--
-- Esta migration NAO e reversivel sem perda. Uma sprint podia ter varios marcos;
-- no novo modelo ela aponta para no maximo um. Rode `npm run adr011:audit` ANTES de
-- aplicar: o relatorio lista nominalmente cada sprint com mais de um marco e qual
-- deles sera escolhido. Os demais nao sao apagados — passam a ser marcos sem
-- sprint, estado valido no novo modelo.

-- 1. Coluna nova, nula por enquanto: sprints legadas podem nao ter marco algum, e
--    a obrigatoriedade vive no payload de criacao, nao no banco (ADR-011).
ALTER TABLE `Sprint` ADD COLUMN `milestoneId` INTEGER NULL;

-- 2. Backfill: cada sprint herda o marco de menor prazo entre os seus.
--    Empate no prazo decide pelo menor id, para o resultado nao depender da ordem
--    fisica das linhas — a migration precisa produzir o mesmo estado em qualquer
--    replica.
UPDATE `Sprint` s
SET s.`milestoneId` = (
  SELECT m.`id` FROM `Milestone` m
  WHERE m.`sprintId` = s.`id`
  ORDER BY m.`dueDate` ASC, m.`id` ASC
  LIMIT 1
);

CREATE INDEX `Sprint_projectId_milestoneId_idx` ON `Sprint`(`projectId`, `milestoneId`);

-- SET NULL, e nao RESTRICT. Sprint e Milestone sao os DOIS filhos de Project em
-- cascata, e o InnoDB nao garante em que ordem processa FKs irmas: com RESTRICT,
-- apagar um projeto falharia toda vez que Milestone fosse processada primeiro.
--
-- O agrupamento nao fica desprotegido: `DELETE /milestones/:id` recusa com
-- MILESTONE_HAS_SPRINTS enquanto houver sprint apontando para o marco, e a
-- contagem que decide isso e lida sob o lock do projeto. A FK aqui responde por
-- outra coisa — nao deixar `milestoneId` apontando para uma linha que sumiu.
ALTER TABLE `Sprint`
  ADD CONSTRAINT `Sprint_milestoneId_fkey`
  FOREIGN KEY (`milestoneId`) REFERENCES `Milestone`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. O lado antigo sai. Ordem obrigatoria no MySQL: a FK segura a coluna, e o
--    indice composto (sprintId, status) impede o DROP COLUMN direto.
ALTER TABLE `Milestone` DROP FOREIGN KEY `Milestone_sprintId_fkey`;
DROP INDEX `Milestone_sprintId_status_idx` ON `Milestone`;
ALTER TABLE `Milestone` DROP COLUMN `sprintId`;
