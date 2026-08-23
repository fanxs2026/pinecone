-- CreateTable
CREATE TABLE "kb_spaces" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "icon" TEXT,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "visibility" TEXT NOT NULL DEFAULT 'everyone',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "kb_spaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kb_pages" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "spaceId" UUID,
    "parentId" UUID,
    "path" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "content" JSONB,
    "contentText" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "authorId" UUID NOT NULL,
    "updaterId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "kb_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kb_comments" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "pageId" UUID NOT NULL,
    "parentId" UUID,
    "authorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "kb_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kb_tags" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kb_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kb_page_tags" (
    "pageId" UUID NOT NULL,
    "tagId" UUID NOT NULL,

    CONSTRAINT "kb_page_tags_pkey" PRIMARY KEY ("pageId","tagId")
);

-- CreateIndex
CREATE UNIQUE INDEX "kb_spaces_workspaceId_slug_key" ON "kb_spaces"("workspaceId", "slug");

-- CreateIndex
CREATE INDEX "kb_spaces_workspaceId_idx" ON "kb_spaces"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "kb_pages_workspaceId_spaceId_slug_key" ON "kb_pages"("workspaceId", "spaceId", "slug");

-- CreateIndex
CREATE INDEX "kb_pages_workspaceId_idx" ON "kb_pages"("workspaceId");

-- CreateIndex
CREATE INDEX "kb_pages_parentId_idx" ON "kb_pages"("parentId");

-- CreateIndex
CREATE INDEX "kb_pages_spaceId_idx" ON "kb_pages"("spaceId");

-- CreateIndex
CREATE INDEX "kb_pages_status_idx" ON "kb_pages"("status");

-- CreateIndex
CREATE INDEX "kb_comments_pageId_idx" ON "kb_comments"("pageId");

-- CreateIndex
CREATE INDEX "kb_comments_workspaceId_idx" ON "kb_comments"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "kb_tags_workspaceId_slug_key" ON "kb_tags"("workspaceId", "slug");

-- CreateIndex
CREATE INDEX "kb_tags_workspaceId_idx" ON "kb_tags"("workspaceId");

-- AddForeignKey
ALTER TABLE "kb_spaces" ADD CONSTRAINT "kb_spaces_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_pages" ADD CONSTRAINT "kb_pages_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_pages" ADD CONSTRAINT "kb_pages_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "kb_spaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_pages" ADD CONSTRAINT "kb_pages_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "kb_pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_pages" ADD CONSTRAINT "kb_pages_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_pages" ADD CONSTRAINT "kb_pages_updaterId_fkey" FOREIGN KEY ("updaterId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_comments" ADD CONSTRAINT "kb_comments_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_comments" ADD CONSTRAINT "kb_comments_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "kb_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_comments" ADD CONSTRAINT "kb_comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "kb_comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_comments" ADD CONSTRAINT "kb_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_tags" ADD CONSTRAINT "kb_tags_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_page_tags" ADD CONSTRAINT "kb_page_tags_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "kb_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_page_tags" ADD CONSTRAINT "kb_page_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "kb_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
