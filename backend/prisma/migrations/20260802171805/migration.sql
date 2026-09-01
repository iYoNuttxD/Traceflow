/*
  Warnings:

  - You are about to alter the column `githubLastSyncError` on the `Project` table. The data in that column could be lost. The data in that column will be cast from `VarChar(255)` to `VarChar(191)`.

*/
-- AlterTable
ALTER TABLE `Project` MODIFY `githubLastSyncError` VARCHAR(191) NULL;
