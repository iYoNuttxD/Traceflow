-- Cursor pagination ordena de forma determinística por taskId, createdAt e id.
CREATE INDEX `TaskComment_taskId_createdAt_id_idx`
  ON `TaskComment`(`taskId`, `createdAt`, `id`);
