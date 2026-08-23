-- 2026-08-19 设置·系统管理可读性：Activity 增加操作来源 IP（仅新记录有值，历史行为空）
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "ip" TEXT;
