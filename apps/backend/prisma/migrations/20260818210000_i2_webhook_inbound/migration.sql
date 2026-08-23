-- I2 入站消息命令（2026-08-18 P1）：企微接收消息服务器 / 钉钉机器人配置
-- 手动 ALTER 执行（本地迁移链已脱轨，不能走 prisma migrate dev）
CREATE TABLE "webhook_inbound" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "platform" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "token" TEXT,
  "encodingAESKey" TEXT,
  "callbackPath" TEXT NOT NULL,
  "commandPrefix" TEXT NOT NULL DEFAULT '/pinecone',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "webhook_inbound_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "webhook_inbound_workspaceId_platform_key" ON "webhook_inbound"("workspaceId", "platform");
ALTER TABLE "webhook_inbound" ADD CONSTRAINT "webhook_inbound_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "webhook_inbound" ADD CONSTRAINT "webhook_inbound_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
