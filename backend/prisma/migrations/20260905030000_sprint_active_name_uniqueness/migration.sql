-- Keep the exact existing name comparison semantics, including collation and padding.
-- The generated key is maintained atomically on INSERT, rename and soft delete.
-- One atomic ALTER validates the new unique index before releasing the old constraint.
-- Any active duplicate makes the DDL fail; no historical row or name is rewritten.
SET @planning_name_charset = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Sprint' AND COLUMN_NAME = 'name');
SET @planning_name_collation = (SELECT COLLATION_NAME FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Sprint' AND COLUMN_NAME = 'name');
SET @planning_name_ddl = CONCAT(
  'ALTER TABLE `Sprint` ADD COLUMN `activeNameKey` VARCHAR(191) CHARACTER SET ',
  @planning_name_charset, ' COLLATE ', @planning_name_collation,
  ' GENERATED ALWAYS AS (CASE WHEN `deletedAt` IS NULL THEN `name` ELSE NULL END) STORED,',
  ' ADD UNIQUE INDEX `Sprint_projectId_activeNameKey_key` (`projectId`, `activeNameKey`),',
  ' DROP INDEX `Sprint_projectId_name_key`'
);
PREPARE planning_name_statement FROM @planning_name_ddl;
EXECUTE planning_name_statement;
DEALLOCATE PREPARE planning_name_statement;
