-- 第二批 G1 报表：自定义仪表盘（工作区级共享）+ 定时报表订阅（站内通知）
-- 列名遵循项目 camelCase 惯例（与 Prisma 字段名一致）
-- 2026-08-21 修正：id/workspaceId/createdById 由 TEXT 改为 UUID（对齐 schema.prisma @db.Uuid）

CREATE TABLE "dashboards" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "name" TEXT NOT NULL DEFAULT '我的报表',
  "config" JSONB NOT NULL DEFAULT '{}',
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dashboards_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "report_subscriptions" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "schedule" TEXT NOT NULL DEFAULT 'DAILY',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "report_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dashboards_workspaceId_idx" ON "dashboards"("workspaceId");
CREATE UNIQUE INDEX "dashboards_workspaceId_key" ON "dashboards"("workspaceId");
CREATE INDEX "report_subscriptions_workspaceId_idx" ON "report_subscriptions"("workspaceId");
