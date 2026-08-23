-- G1 知识库升级（2026-08-16 老板拍板全量 5 项）：
-- P1-A KbPageLink 双向关联 / P1-B 页面权限 / P2-A 版本快照 / P2-B 全文检索
-- 列名遵循项目 camelCase 惯例
-- 2026-08-21 修正：id/workspaceId/pageId/entityId/createdById/editorId 由 TEXT 改为 UUID（对齐 schema.prisma @db.Uuid）

CREATE TABLE "kb_page_links" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "pageId" UUID NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" UUID NOT NULL,
  "linkType" TEXT NOT NULL DEFAULT 'REFERENCE',
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "kb_page_links_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "kb_page_versions" (
  "id" UUID NOT NULL,
  "pageId" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "contentSnapshot" JSONB,
  "editorId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "kb_page_versions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "kb_pages" ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'SPACE';
ALTER TABLE "kb_pages" ADD COLUMN "allowedRoleIds" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "kb_pages" ADD COLUMN "searchVector" tsvector;

CREATE UNIQUE INDEX "kb_page_links_pageId_entityType_entityId_key" ON "kb_page_links"("pageId", "entityType", "entityId");
CREATE INDEX "kb_page_links_workspaceId_entityType_entityId_idx" ON "kb_page_links"("workspaceId", "entityType", "entityId");
CREATE UNIQUE INDEX "kb_page_versions_pageId_version_key" ON "kb_page_versions"("pageId", "version");
CREATE INDEX "kb_page_versions_pageId_idx" ON "kb_page_versions"("pageId");
CREATE INDEX "kb_pages_searchVector_idx" ON "kb_pages" USING GIN ("searchVector");
