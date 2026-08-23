-- I12 License 强校验（2026-08-18 P2）：RSA 签名列（key.edition.expiresAt.seats 私钥签名，离线验签防伪造）
ALTER TABLE "licenses" ADD COLUMN IF NOT EXISTS "signature" TEXT;
