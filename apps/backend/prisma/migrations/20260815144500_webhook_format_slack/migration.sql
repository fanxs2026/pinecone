-- P2 集成生态：webhook endpoint 支持 Slack Incoming Webhook 模板格式
ALTER TABLE "webhook_endpoints" ADD COLUMN IF NOT EXISTS "format" TEXT NOT NULL DEFAULT 'JSON';
