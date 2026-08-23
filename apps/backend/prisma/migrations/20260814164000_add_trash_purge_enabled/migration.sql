-- AlterTable
-- 2026-08-14：回收站自动清理开关（软删超过 N 天物理删除），默认开启 180 天
ALTER TABLE "workspaces" ADD COLUMN "trashPurgeEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "workspaces" ADD COLUMN "trashPurgeDays" INTEGER NOT NULL DEFAULT 180;
