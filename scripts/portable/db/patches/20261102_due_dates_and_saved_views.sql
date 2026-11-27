--
-- Pinecone 便携版：存量库增量补丁
-- 对象：2026-11-02 两个迁移（实体交付时限 due_date / 列表保存视图 saved_views）
--
-- 用途：给「已经用旧 schema.sql 建过库」的部署机补齐缺失结构，不丢数据。
-- 全部幂等，重复执行安全。
--
-- 症状对照（缺这段结构时）：
--   - 新建/查看 支持请求、特性、任务 → 500 internal server error（Prisma P2022: column "due_date" does not exist）
--   - 列表页「保存视图」→ 500（relation "saved_views" does not exist）
--
-- 执行方式（在部署目录下，任选其一）：
--   1) psql -U pinecone_admin -d pinecone -f db/patches/20261102_due_dates_and_saved_views.sql
--   2) node bin/patch-db.js
--

ALTER TABLE public.stories  ADD COLUMN IF NOT EXISTS due_date date;
ALTER TABLE public.features ADD COLUMN IF NOT EXISTS due_date date;
ALTER TABLE public.supports ADD COLUMN IF NOT EXISTS due_date date;

CREATE INDEX IF NOT EXISTS "stories_workspaceId_due_date_idx"  ON public.stories  USING btree ("workspaceId", due_date);
CREATE INDEX IF NOT EXISTS "features_workspaceId_due_date_idx" ON public.features USING btree ("workspaceId", due_date);
CREATE INDEX IF NOT EXISTS "supports_workspaceId_due_date_idx" ON public.supports USING btree ("workspaceId", due_date);

CREATE TABLE IF NOT EXISTS public.saved_views (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    "entityType" public."EntityType" NOT NULL,
    name text NOT NULL,
    filters jsonb NOT NULL,
    columns jsonb,
    "isShared" boolean DEFAULT false NOT NULL,
    "createdById" uuid NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "saved_views_workspaceId_entityType_idx"
    ON public.saved_views USING btree ("workspaceId", "entityType");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'saved_views_pkey') THEN
        ALTER TABLE public.saved_views ADD CONSTRAINT "saved_views_pkey" PRIMARY KEY (id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'saved_views_workspaceId_entityType_name_key') THEN
        ALTER TABLE public.saved_views ADD CONSTRAINT "saved_views_workspaceId_entityType_name_key"
            UNIQUE ("workspaceId", "entityType", name);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'saved_views_workspaceId_fkey') THEN
        ALTER TABLE public.saved_views ADD CONSTRAINT "saved_views_workspaceId_fkey"
            FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'saved_views_createdById_fkey') THEN
        ALTER TABLE public.saved_views ADD CONSTRAINT "saved_views_createdById_fkey"
            FOREIGN KEY ("createdById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pinecone_app') THEN
        GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.saved_views TO pinecone_app;
    END IF;
END $$;
