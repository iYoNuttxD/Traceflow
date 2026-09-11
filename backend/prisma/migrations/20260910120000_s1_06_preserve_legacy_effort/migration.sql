-- S1-06 (RF34): preserva o esforço realizado que existia antes das sessões de tempo.
-- `Task.actualEffort` passou a ser derivado da soma das sessões; uma tarefa que já
-- trazia valor do contrato anterior perderia esse total no primeiro recálculo. O
-- montante herdado é capturado em coluna própria e volta a somar no derivado, sem
-- inventar autoria nem datas de sessão que nunca existiram.
ALTER TABLE `Task` ADD COLUMN `legacyActualEffort` DOUBLE NULL;

UPDATE `Task`
SET `legacyActualEffort` = `actualEffort`
WHERE `actualEffort` IS NOT NULL
  AND `actualEffort` > 0
  AND NOT EXISTS (
    SELECT 1 FROM `TaskTimeEntry`
    WHERE `TaskTimeEntry`.`taskId` = `Task`.`id`
      AND `TaskTimeEntry`.`endedAt` IS NOT NULL
  );
