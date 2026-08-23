-- 2026-08-21: 平台级设置表（key-value，SMTP 等管理端可配置项）
-- 结构以 prisma/schema.prisma 的 Setting 模型为准；幂等写法兼容存量库。
CREATE TABLE IF NOT EXISTS "settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "is_secret" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);
