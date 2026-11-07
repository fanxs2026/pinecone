-- 2026-11-02: 实体交付时限（承诺完成日）
-- 语义：due_date 只表达「承诺完成日」，与迭代/发布的计划区间互不覆盖。
-- 风险计算在读取时按 due_date → 迭代结束日 → 发布结束日 回退，回退结果不写回本列。
-- 幂等写法，兼容存量库。

ALTER TABLE "stories"  ADD COLUMN IF NOT EXISTS "due_date" DATE;
ALTER TABLE "features" ADD COLUMN IF NOT EXISTS "due_date" DATE;
ALTER TABLE "supports" ADD COLUMN IF NOT EXISTS "due_date" DATE;

-- 逾期清单与风险视图按 (工作区, 截止日) 过滤
CREATE INDEX IF NOT EXISTS "stories_workspaceId_due_date_idx"
    ON "stories"  ("workspaceId", "due_date");
CREATE INDEX IF NOT EXISTS "features_workspaceId_due_date_idx"
    ON "features" ("workspaceId", "due_date");
CREATE INDEX IF NOT EXISTS "supports_workspaceId_due_date_idx"
    ON "supports" ("workspaceId", "due_date");
