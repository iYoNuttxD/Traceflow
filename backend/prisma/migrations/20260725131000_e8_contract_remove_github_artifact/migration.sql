-- Contract protegido: artifacts genéricos somente podem ser removidos após reconciliação.
DROP TABLE IF EXISTS `_E8GithubArtifactContractGuard`;
CREATE TABLE `_E8GithubArtifactContractGuard` (`id` INTEGER NOT NULL, PRIMARY KEY (`id`));
INSERT INTO `_E8GithubArtifactContractGuard` (`id`) VALUES (1);
INSERT INTO `_E8GithubArtifactContractGuard` (`id`)
SELECT 1 FROM `GithubArtifact` LIMIT 1;
DROP TABLE `_E8GithubArtifactContractGuard`;
DROP TABLE `GithubArtifact`;
