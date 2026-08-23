-- 统一新建 Story 默认状态为 OPEN（与全局"新建实体 = Open"标准对齐）
-- 原默认值 TODO 不在 STORY_STATUSES 白名单（OPEN/IN_PROGRESS/REVIEW/DONE/BLOCKED）内，
-- 会导致详情页下拉匹配不到选项（显示空白）、看板无对应列。
ALTER TABLE "stories" ALTER COLUMN "status" SET DEFAULT 'OPEN';

-- 回填历史遗留的 TODO 状态记录（同样不在白名单内）
UPDATE "stories" SET "status" = 'OPEN' WHERE "status" = 'TODO';
