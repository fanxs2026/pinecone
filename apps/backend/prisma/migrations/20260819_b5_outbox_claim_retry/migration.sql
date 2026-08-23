-- B5 修复（2026-08-19 上线前全检）：event_outbox 原子认领 + 指数退避重试
-- 注意：本表列为 Prisma 默认映射（camelCase 字段名原样作列名，仅表名 @@map 为 event_outbox），
-- 新增列必须与模型字段名一致（claimedAt / nextRetryAt）。
-- 以 pinecone_admin（DDL）身份执行；pinecone_app 自动继承 DML。
ALTER TABLE "event_outbox" ADD COLUMN IF NOT EXISTS "claimedAt" TIMESTAMP(3);
ALTER TABLE "event_outbox" ADD COLUMN IF NOT EXISTS "nextRetryAt" TIMESTAMP(3);
