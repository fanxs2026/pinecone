-- AlterTable: add creator (createdById) to features and stories
-- 含存量数据回填：优先取 activities 表 CREATED 记录的用户，兜底取工作区最早加入的成员，再兜底取系统第一个用户

-- 1) 先加可空列
ALTER TABLE "features" ADD COLUMN "createdById" UUID;
ALTER TABLE "stories" ADD COLUMN "createdById" UUID;

-- 2) 回填 features：优先 CREATED activity 记录，其次工作区最早成员
UPDATE "features" f
SET "createdById" = COALESCE(
  (SELECT a."userId" FROM "activities" a
   WHERE a."entityType" = 'FEATURE' AND a."entityId" = f."id" AND a."action" = 'CREATED' AND a."userId" IS NOT NULL
   LIMIT 1),
  (SELECT wm."userId" FROM "workspace_members" wm
   WHERE wm."workspaceId" = f."workspaceId"
   ORDER BY wm."createdAt" ASC LIMIT 1)
);

-- 3) 回填 stories：同上
UPDATE "stories" s
SET "createdById" = COALESCE(
  (SELECT a."userId" FROM "activities" a
   WHERE a."entityType" = 'STORY' AND a."entityId" = s."id" AND a."action" = 'CREATED' AND a."userId" IS NOT NULL
   LIMIT 1),
  (SELECT wm."userId" FROM "workspace_members" wm
   WHERE wm."workspaceId" = s."workspaceId"
   ORDER BY wm."createdAt" ASC LIMIT 1)
);

-- 4) 安全网：仍为 NULL 的行（无任何成员的工作区）→ 系统第一个用户
UPDATE "features" f SET "createdById" = (SELECT id FROM "users" ORDER BY "createdAt" ASC LIMIT 1) WHERE f."createdById" IS NULL;
UPDATE "stories" s SET "createdById" = (SELECT id FROM "users" ORDER BY "createdAt" ASC LIMIT 1) WHERE s."createdById" IS NULL;

-- 5) 强制 NOT NULL + 外键 + 索引
ALTER TABLE "features" ALTER COLUMN "createdById" SET NOT NULL;
ALTER TABLE "stories" ALTER COLUMN "createdById" SET NOT NULL;

ALTER TABLE "features" ADD CONSTRAINT "features_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stories" ADD CONSTRAINT "stories_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "features_createdById_idx" ON "features"("createdById");
CREATE INDEX "stories_createdById_idx" ON "stories"("createdById");
