-- S201-A03: textos importados do GitHub cabem nas colunas. Títulos chegam a 256 caracteres,
-- nomes completos de branch passam de 255 e URLs de commit passam de 191.
-- GitBranch.name preserva a collation utf8mb4_bin da LR.5, auditada por db:lr5:audit.

ALTER TABLE `PullRequest`
  MODIFY `title` VARCHAR(256) NOT NULL,
  MODIFY `sourceBranch` VARCHAR(512) NULL,
  MODIFY `targetBranch` VARCHAR(512) NULL,
  MODIFY `githubUrl` VARCHAR(512) NULL;

ALTER TABLE `Issue`
  MODIFY `title` VARCHAR(256) NOT NULL,
  MODIFY `milestone` VARCHAR(255) NULL,
  MODIFY `githubUrl` VARCHAR(512) NULL;

ALTER TABLE `Commit`
  MODIFY `authorName` VARCHAR(255) NULL,
  MODIFY `authorEmail` VARCHAR(255) NULL,
  MODIFY `githubUrl` VARCHAR(512) NULL;

ALTER TABLE `GitBranch`
  MODIFY `name` VARCHAR(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;

ALTER TABLE `ProjectGitHubIntegration`
  MODIFY `defaultBranch` VARCHAR(512) NULL;

ALTER TABLE `TraceabilityAlert`
  MODIFY `subjectTitle` VARCHAR(256) NOT NULL;
