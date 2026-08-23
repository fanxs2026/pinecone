-- P2 品牌化路线图分享：ShareLink 支持发布周期（RELEASE）分享 + 品牌字段 + 视图模式
ALTER TABLE "share_links" ADD COLUMN IF NOT EXISTS "brandTitle" TEXT;
ALTER TABLE "share_links" ADD COLUMN IF NOT EXISTS "brandColor" TEXT;
ALTER TABLE "share_links" ADD COLUMN IF NOT EXISTS "viewMode" TEXT NOT NULL DEFAULT 'FULL';
