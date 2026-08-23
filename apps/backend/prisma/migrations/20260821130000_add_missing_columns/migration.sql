-- 2026-08-21: 补齐迁移链与 schema.prisma 的列级/枚举/索引/外键差异
-- 背景：大量列/索引/外键由 db push 时代直加（无迁移记录），如 users.isSystemAdmin、
--       stories.parentId/sprintId/teamId、supports.type、EntityType 枚举新值等。
--       仅凭补齐建表迁移，空库 migrate deploy 后仍与 schema 不一致（e2e 实测暴露
--       ColumnNotFound: users.isSystemAdmin）。
-- 幂等策略：只做"加法"（ADD），不做 DROP——对迁移链空库补全缺失，对存量库全部跳过；
--       枚举用 DO 块防 duplicate_object，列用 IF NOT EXISTS，索引用 IF NOT EXISTS，
--       外键用 DO 块按 conname 防重。不做减法避免破坏任何已有库。

-- AlterEnum: EntityType 增加新值（PG 无 ADD VALUE IF NOT EXISTS，DO 块防重）
DO $$
BEGIN
  ALTER TYPE "EntityType" ADD VALUE 'TEST_CASE';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE "EntityType" ADD VALUE 'IMPORT_JOB';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable: features
ALTER TABLE "features" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "features" ADD COLUMN IF NOT EXISTS "isEpic" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "features" ADD COLUMN IF NOT EXISTS "teamId" UUID;

-- AlterTable: ideas
ALTER TABLE "ideas" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "ideas" ADD COLUMN IF NOT EXISTS "sprintId" UUID;
ALTER TABLE "ideas" ADD COLUMN IF NOT EXISTS "teamId" UUID;

-- AlterTable: stories
ALTER TABLE "stories" ADD COLUMN IF NOT EXISTS "assigneeName" TEXT;
ALTER TABLE "stories" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "stories" ADD COLUMN IF NOT EXISTS "parentId" UUID;
ALTER TABLE "stories" ADD COLUMN IF NOT EXISTS "sprintId" UUID;
ALTER TABLE "stories" ADD COLUMN IF NOT EXISTS "teamId" UUID;

-- AlterTable: story_statuses
ALTER TABLE "story_statuses" ADD COLUMN IF NOT EXISTS "wipLimit" INTEGER;

-- AlterTable: supports
ALTER TABLE "supports" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "supports" ADD COLUMN IF NOT EXISTS "releaseId" UUID;
ALTER TABLE "supports" ADD COLUMN IF NOT EXISTS "teamId" UUID;
ALTER TABLE "supports" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'SUPPORT_REQUEST';

-- AlterTable: users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isSystemAdmin" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "dashboards_workspaceId_idx" ON "dashboards"("workspaceId");
CREATE INDEX IF NOT EXISTS "kb_page_links_workspaceId_entityType_entityId_idx" ON "kb_page_links"("workspaceId", "entityType", "entityId");
CREATE UNIQUE INDEX IF NOT EXISTS "kb_page_links_pageId_entityType_entityId_key" ON "kb_page_links"("pageId", "entityType", "entityId");
CREATE INDEX IF NOT EXISTS "kb_page_versions_pageId_idx" ON "kb_page_versions"("pageId");
CREATE UNIQUE INDEX IF NOT EXISTS "kb_page_versions_pageId_version_key" ON "kb_page_versions"("pageId", "version");
CREATE INDEX IF NOT EXISTS "report_subscriptions_workspaceId_idx" ON "report_subscriptions"("workspaceId");
CREATE INDEX IF NOT EXISTS "supports_workspaceId_releaseId_idx" ON "supports"("workspaceId", "releaseId");

-- AddForeignKey (DO 块按 conname 防重；引用的表均已在此前迁移存在)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stories_sprintId_fkey') THEN
    ALTER TABLE "stories" ADD CONSTRAINT "stories_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "sprints"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stories_parentId_fkey') THEN
    ALTER TABLE "stories" ADD CONSTRAINT "stories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supports_releaseId_fkey') THEN
    ALTER TABLE "supports" ADD CONSTRAINT "supports_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "releases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'votes_workspaceId_fkey') THEN
    ALTER TABLE "votes" ADD CONSTRAINT "votes_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'themes_workspaceId_fkey') THEN
    ALTER TABLE "themes" ADD CONSTRAINT "themes_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'entity_themes_workspaceId_fkey') THEN
    ALTER TABLE "entity_themes" ADD CONSTRAINT "entity_themes_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'entity_themes_themeId_fkey') THEN
    ALTER TABLE "entity_themes" ADD CONSTRAINT "entity_themes_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "themes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scores_workspaceId_fkey') THEN
    ALTER TABLE "scores" ADD CONSTRAINT "scores_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kb_page_links_workspaceId_fkey') THEN
    ALTER TABLE "kb_page_links" ADD CONSTRAINT "kb_page_links_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kb_page_links_pageId_fkey') THEN
    ALTER TABLE "kb_page_links" ADD CONSTRAINT "kb_page_links_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "kb_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kb_page_links_createdById_fkey') THEN
    ALTER TABLE "kb_page_links" ADD CONSTRAINT "kb_page_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kb_page_versions_pageId_fkey') THEN
    ALTER TABLE "kb_page_versions" ADD CONSTRAINT "kb_page_versions_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "kb_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kb_page_versions_editorId_fkey') THEN
    ALTER TABLE "kb_page_versions" ADD CONSTRAINT "kb_page_versions_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'entity_counters_workspaceId_fkey') THEN
    ALTER TABLE "entity_counters" ADD CONSTRAINT "entity_counters_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dashboards_workspaceId_fkey') THEN
    ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dashboards_createdById_fkey') THEN
    ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'report_subscriptions_workspaceId_fkey') THEN
    ALTER TABLE "report_subscriptions" ADD CONSTRAINT "report_subscriptions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'report_subscriptions_createdById_fkey') THEN
    ALTER TABLE "report_subscriptions" ADD CONSTRAINT "report_subscriptions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
