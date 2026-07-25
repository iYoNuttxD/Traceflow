-- Contract protegido: vínculos genéricos somente podem ser removidos após materialização tipada.
DROP TABLE IF EXISTS `_E8TraceLinkContractGuard`;
CREATE TABLE `_E8TraceLinkContractGuard` (`id` INTEGER NOT NULL, PRIMARY KEY (`id`));
INSERT INTO `_E8TraceLinkContractGuard` (`id`) VALUES (1);
INSERT INTO `_E8TraceLinkContractGuard` (`id`)
SELECT 1 FROM `TraceLink` LIMIT 1;
DROP TABLE `_E8TraceLinkContractGuard`;
DROP TABLE `TraceLink`;
