-- S201-A03: o registro da execução do sync guarda o nome completo da branch em andamento,
-- que passa de 191 caracteres como os demais nomes de branch.

ALTER TABLE `GitHubSyncRun`
  MODIFY `currentBranch` VARCHAR(512) NULL;
