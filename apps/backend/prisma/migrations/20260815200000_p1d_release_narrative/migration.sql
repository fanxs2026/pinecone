-- 2026-08-15: P1-D 发布周期叙事字段（公开路线图 NARRATIVE 视图）
ALTER TABLE "releases" ADD COLUMN IF NOT EXISTS "milestone" TEXT;
ALTER TABLE "releases" ADD COLUMN IF NOT EXISTS "narrative" TEXT;
