-- I7 评分历史快照（2026-08-18 P1，老板拍板：仅保存时快照）
-- 手动 ALTER 执行（本地迁移链已脱轨，不能走 prisma migrate dev；与 _prisma_migrations 记录方式一致保留迁移文件）
CREATE TABLE "score_history" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "entityType" "EntityType" NOT NULL,
  "entityId" UUID NOT NULL,
  "model" TEXT NOT NULL DEFAULT 'RICE',
  "dimensions" JSONB NOT NULL,
  "weightedScore" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "score_history_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "score_history_entityType_entityId_createdAt_idx" ON "score_history"("entityType", "entityId", "createdAt");
ALTER TABLE "score_history" ADD CONSTRAINT "score_history_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
