-- 2026-08-15: P1-C 通用 CI 回写 + 多 VCS 入站
-- ① github_configs 泛化（provider 列，存量默认 GITHUB）
ALTER TABLE "github_configs" ADD COLUMN IF NOT EXISTS "provider" TEXT NOT NULL DEFAULT 'GITHUB';
CREATE INDEX IF NOT EXISTS "github_configs_workspaceId_provider_idx" ON "github_configs"("workspaceId", "provider");

-- ② CI 配置表（入站 HMAC secret，AES-GCM 加密存储）
CREATE TABLE IF NOT EXISTS "ci_configs" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "secretEnc" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ci_configs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ci_configs_workspaceId_name_key" UNIQUE ("workspaceId", "name")
);
CREATE INDEX IF NOT EXISTS "ci_configs_workspaceId_idx" ON "ci_configs"("workspaceId");
ALTER TABLE "ci_configs" DROP CONSTRAINT IF EXISTS "ci_configs_workspaceId_fkey";
ALTER TABLE "ci_configs" ADD CONSTRAINT "ci_configs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ③ CI 构建记录表（轻量，拉近 Zentao 构建记录）
CREATE TABLE IF NOT EXISTS "ci_builds" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "ciConfigId" UUID,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "branch" TEXT,
  "commit" TEXT,
  "url" TEXT,
  "releaseId" UUID,
  "testRunCount" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ci_builds_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ci_builds_workspaceId_idx" ON "ci_builds"("workspaceId");
CREATE INDEX IF NOT EXISTS "ci_builds_releaseId_idx" ON "ci_builds"("releaseId");
ALTER TABLE "ci_builds" DROP CONSTRAINT IF EXISTS "ci_builds_workspaceId_fkey";
ALTER TABLE "ci_builds" ADD CONSTRAINT "ci_builds_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ci_builds" DROP CONSTRAINT IF EXISTS "ci_builds_ciConfigId_fkey";
ALTER TABLE "ci_builds" ADD CONSTRAINT "ci_builds_ciConfigId_fkey" FOREIGN KEY ("ciConfigId") REFERENCES "ci_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
