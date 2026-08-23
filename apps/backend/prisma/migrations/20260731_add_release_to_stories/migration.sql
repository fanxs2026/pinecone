-- AlterTable: Story 增加发布周期（fix version）关联
-- 可空列 + SET NULL：删除 release 时 story 保留、releaseId 置空

-- 1) 加可空列
ALTER TABLE "stories" ADD COLUMN "releaseId" UUID;

-- 2) 外键 + 索引
ALTER TABLE "stories" ADD CONSTRAINT "stories_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "releases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "stories_releaseId_idx" ON "stories"("releaseId");
