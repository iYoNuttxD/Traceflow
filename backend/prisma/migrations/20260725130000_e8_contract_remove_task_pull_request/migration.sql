-- Contract protegido: o reconciliador deve materializar todo vínculo em Task.pullRequestId.
-- A chave primária temporária força falha antes do DROP se qualquer linha permanecer.
DROP TABLE IF EXISTS `_E8TaskPullRequestContractGuard`;
CREATE TABLE `_E8TaskPullRequestContractGuard` (`id` INTEGER NOT NULL, PRIMARY KEY (`id`));
INSERT INTO `_E8TaskPullRequestContractGuard` (`id`) VALUES (1);
INSERT INTO `_E8TaskPullRequestContractGuard` (`id`)
SELECT 1 FROM `TaskPullRequest` LIMIT 1;
DROP TABLE `_E8TaskPullRequestContractGuard`;
DROP TABLE `TaskPullRequest`;
