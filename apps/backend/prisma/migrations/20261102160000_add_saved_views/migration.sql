-- 2026-11-02: 列表保存视图
-- 结构以 prisma/schema.prisma 的 SavedView 模型为准；幂等写法兼容存量库。
-- filters 与列表查询参数 cf 同结构，columns 为列 key 数组（内置列或 cf:<字段key>）。

CREATE TABLE IF NOT EXISTS "saved_views" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "columns" JSONB,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "createdById" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_views_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "saved_views_workspaceId_entityType_name_key"
    ON "saved_views"("workspaceId", "entityType", "name");

CREATE INDEX IF NOT EXISTS "saved_views_workspaceId_entityType_idx"
    ON "saved_views"("workspaceId", "entityType");

-- 外键（幂等：存量库重复执行不报错）
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'saved_views_workspaceId_fkey'
    ) THEN
        ALTER TABLE "saved_views"
            ADD CONSTRAINT "saved_views_workspaceId_fkey"
            FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'saved_views_createdById_fkey'
    ) THEN
        ALTER TABLE "saved_views"
            ADD CONSTRAINT "saved_views_createdById_fkey"
            FOREIGN KEY ("createdById") REFERENCES "users"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- 注：custom_fields 的 GIN 索引仍未建立。当前按字段值筛选走的是 JSONB 路径等值比较
-- （->> 语义），GIN 的 jsonb_path_ops 只对 @> 包含查询有效，建了也用不上，反而增加写入开销。
-- 将来若把筛选改为包含查询，再随迁移一并添加。
