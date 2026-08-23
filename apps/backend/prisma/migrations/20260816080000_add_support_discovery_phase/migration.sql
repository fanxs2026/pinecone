-- 缺陷发现阶段（决策 2026-08-16：逃逸率口径用 phase 字段，精确区分测试/生产/客户发现）
-- 仅 type=DEFECT 有意义；NULL = 未标注（存量数据）
-- 注意：项目 DB 列名惯例为 camelCase（与 Prisma 字段名一致，如 rootCause/workspaceId），故列名为 "discoveryPhase"（带引号保留大小写）
ALTER TABLE "supports" ADD COLUMN "discoveryPhase" TEXT;
