-- 2026-11-02: 工作区自定义属性
-- 结构以 prisma/schema.prisma 的 CustomField 模型为准；幂等写法兼容存量库。
-- 设计：字段定义落 custom_fields（类型/必填/选项/排序/归档），值落各实体的
-- custom_fields JSONB 列，读取实体零 join；归档字段保留历史值。
-- 注：JSONB 的 GIN 索引随后续筛选能力一并添加，当前无筛选入口不预先建索引。

CREATE TABLE IF NOT EXISTS "custom_fields" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'TEXT',
    "options" JSONB,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "defaultValue" JSONB,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_fields_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "custom_fields_workspaceId_entityType_key_key"
    ON "custom_fields"("workspaceId", "entityType", "key");

CREATE INDEX IF NOT EXISTS "custom_fields_workspaceId_entityType_isActive_idx"
    ON "custom_fields"("workspaceId", "entityType", "isActive");

-- 外键（幂等：存量库重复执行不报错）
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'custom_fields_workspaceId_fkey'
    ) THEN
        ALTER TABLE "custom_fields"
            ADD CONSTRAINT "custom_fields_workspaceId_fkey"
            FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- 四类实体的自定义属性值列
ALTER TABLE "ideas"    ADD COLUMN IF NOT EXISTS "custom_fields" JSONB;
ALTER TABLE "features" ADD COLUMN IF NOT EXISTS "custom_fields" JSONB;
ALTER TABLE "stories"  ADD COLUMN IF NOT EXISTS "custom_fields" JSONB;
ALTER TABLE "supports" ADD COLUMN IF NOT EXISTS "custom_fields" JSONB;
