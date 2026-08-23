-- 2026-08-15: 缺陷折叠进 Support.type=DEFECT + Story.kind（无独立 Bug 实体）
-- 缺陷严重度（仅 type=DEFECT 有意义，可空）
ALTER TABLE "supports" ADD COLUMN "severity" TEXT;

-- 缺陷根因（选填，type=DEFECT 时有效）
ALTER TABLE "supports" ADD COLUMN "rootCause" TEXT;

-- Story 子类型：功能 / 缺陷 / 技术债
ALTER TABLE "stories"  ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'FEATURE';

-- Support.type 的 DEFECT 取值是既有 String 列新增字符串，无需 DDL
