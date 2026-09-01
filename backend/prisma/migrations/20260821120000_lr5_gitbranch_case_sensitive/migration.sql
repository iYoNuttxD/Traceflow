-- LR.5 preserves Git branch names exactly as provided by Git. MySQL's previous
-- utf8mb4_unicode_ci collation made the unique key (projectId, name) case-insensitive.
-- Changing to utf8mb4_bin widens the set of representable names and does not delete,
-- merge or rewrite any existing row. Run `npm run db:lr5:preflight` before deployment.

ALTER TABLE `GitBranch`
  MODIFY `name` VARCHAR(191)
  CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
