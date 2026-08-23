import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { getSecret } from '../config/env-secrets';

/**
 * 敏感可逆数据的 AES-256-GCM 加密封装（安全官 P1-3：SSO clientSecret /
 * Webhook secret 等必须可逆存储时用密文，禁止明文落库）。
 *
 * 密钥（P1-⑤ 修复）：优先使用独立环境变量 FIELD_ENCRYPTION_SECRET 派生——
 * 与 JWT 签名密钥隔离，JWT_ACCESS_SECRET 泄露不再连带解密全部敏感密文。
 * 未配置 FIELD_ENCRYPTION_SECRET 时回退 JWT_ACCESS_SECRET（兼容存量部署的
 * 既有密文；新部署建议显式配置独立密钥，见 .env.example）。
 * 格式：`v1:<iv>:<authTag>:<ciphertext>`（base64url），每次加密随机 IV + GCM tag。
 */
const ALGO = 'aes-256-gcm';
const VERSION = 'v1';

function deriveKey(): Buffer {
  const fieldSecret = process.env.FIELD_ENCRYPTION_SECRET;
  if (fieldSecret && fieldSecret.trim() !== '') {
    return createHash('sha256').update(fieldSecret).digest();
  }
  // F-11 修复（2026-08-19 上线前全检）：生产强制要求独立 FIELD_ENCRYPTION_SECRET，
  // 杜绝 JWT_ACCESS_SECRET 泄露连带解密全部密文；dev 兼容存量（仅回退 JWT 派生）。
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'FIELD_ENCRYPTION_SECRET must be configured in production (separate from JWT secrets)',
    );
  }
  return createHash('sha256').update(getSecret('JWT_ACCESS_SECRET', 32)).digest();
}

export function encryptSecret(plaintext: string): string {
  const key = deriveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    enc.toString('base64url'),
  ].join(':');
}

export function decryptSecret(ciphertext: string): string {
  const parts = ciphertext.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Invalid encrypted secret format');
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const key = deriveKey();
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
