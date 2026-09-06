-- S1-06 (RF33): estimativa em passos de meia hora (1, 1.5, 2...). A estimativa da
-- tarefa e as cópias congeladas na sprint passam a DOUBLE; inteiros existentes são
-- preservados sem conversão de valor.
ALTER TABLE `Task` MODIFY COLUMN `estimatedEffort` DOUBLE NULL;

ALTER TABLE `SprintTask`
  MODIFY COLUMN `pointsAtPlanning` DOUBLE NULL,
  MODIFY COLUMN `pointsAtClose` DOUBLE NULL;
