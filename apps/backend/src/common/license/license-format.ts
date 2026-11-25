import { createVerify } from 'crypto';
import { LICENSE_PUBLIC_KEY_B64 } from './public-key';

/**
 * 企业版 license 凭证的编解码与验签（纯函数，无 IO，便于单测）。
 *
 * 凭证形态（单行字符串，放进 PINE_LICENSE_KEY）：
 *
 *   PINECONE-EE.<base64url(payloadJSON)>.<base64url(RSA-SHA256 签名)>
 *
 * 签名对象 = payloadJSON 的 UTF-8 原始字节（不重新序列化，避免字段顺序/空格
 * 差异导致验签随机失败）。私钥只在签发端（scripts/license-sign.js）。
 *
 * 判定结果用状态机表达，交给 license-state 决定「生效版本」，本文件不做降级决策。
 */

export const LICENSE_PREFIX = 'PINECONE-EE';

export interface LicensePayload {
  /** 凭证格式版本，当前固定 1 */
  v: number;
  /** 许可证编号（台账主键，和 License 表对齐） */
  id: string;
  /** 客户名称（仅用于展示/审计） */
  customer?: string;
  /** 授权版本，当前只支持 ENTERPRISE */
  edition: 'ENTERPRISE';
  /** 席位数（当前不强制，留作后续用量统计） */
  seats?: number;
  /** 签发时间（epoch ms） */
  issuedAt?: number;
  /** 到期时间（epoch ms） */
  expiresAt: number;
}

export type LicenseState =
  | 'licensed'
  | 'missing'
  | 'malformed'
  | 'bad-signature'
  | 'expired'
  | 'wrong-edition';

export interface LicenseStatus {
  state: LicenseState;
  /** 人类可读原因，直接进日志/启动横幅 */
  reason: string;
  payload?: LicensePayload;
  /** 仅在 state=expired 时给出 */
  expiredAt?: number;
}

function decodeBase64Url(input: string): Buffer | null {
  try {
    // base64url -> base64，补 padding
    const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return Buffer.from(padded, 'base64');
  } catch {
    return null;
  }
}

/**
 * 校验凭证。任何异常都收敛成状态，不抛错 —— 调用方据此降级，绝不让坏凭证
 * 把进程搞崩（决策：无/坏/过期一律降级社区版，而不是拒绝启动）。
 */
export function verifyLicense(
  rawKey: string | undefined | null,
  now: number = Date.now(),
  publicKeyB64: string = LICENSE_PUBLIC_KEY_B64
): LicenseStatus {
  const key = (rawKey || '').trim();
  if (!key) return { state: 'missing', reason: 'no licence key configured' };

  const parts = key.split('.');
  if (parts.length !== 3) {
    return { state: 'malformed', reason: 'expected 3 dot-separated parts' };
  }
  const [prefix, payloadPart, signaturePart] = parts;
  if (prefix !== LICENSE_PREFIX) {
    return { state: 'malformed', reason: `unexpected prefix "${prefix}"` };
  }

  const payloadBytes = decodeBase64Url(payloadPart);
  const signatureBytes = decodeBase64Url(signaturePart);
  if (!payloadBytes || !signatureBytes) {
    return { state: 'malformed', reason: 'payload or signature is not valid base64url' };
  }

  let payload: LicensePayload;
  try {
    payload = JSON.parse(payloadBytes.toString('utf8'));
  } catch {
    return { state: 'malformed', reason: 'payload is not valid JSON' };
  }

  if (!payload || typeof payload !== 'object') {
    return { state: 'malformed', reason: 'payload is not an object' };
  }
  if (payload.v !== 1) {
    return { state: 'malformed', reason: `unsupported licence version ${String(payload.v)}` };
  }
  if (typeof payload.expiresAt !== 'number' || !Number.isFinite(payload.expiresAt)) {
    return { state: 'malformed', reason: 'expiresAt missing or not a number' };
  }
  if (typeof payload.id !== 'string' || !payload.id) {
    return { state: 'malformed', reason: 'id missing' };
  }

  // 验签：只信任内置公钥（env 里的公钥一律忽略，否则可被替换绕过）
  let signatureOk = false;
  try {
    const publicKeyPem = Buffer.from(publicKeyB64, 'base64').toString('utf8');
    const verifier = createVerify('RSA-SHA256');
    verifier.update(payloadBytes);
    verifier.end();
    signatureOk = verifier.verify(publicKeyPem, signatureBytes);
  } catch {
    signatureOk = false;
  }
  if (!signatureOk) {
    return { state: 'bad-signature', reason: 'signature does not match the embedded public key' };
  }

  if (payload.edition !== 'ENTERPRISE') {
    return { state: 'wrong-edition', reason: `licence is for ${String(payload.edition)}`, payload };
  }

  if (payload.expiresAt <= now) {
    return {
      state: 'expired',
      reason: `licence expired at ${new Date(payload.expiresAt).toISOString()}`,
      payload,
      expiredAt: payload.expiresAt,
    };
  }

  return {
    state: 'licensed',
    reason: `valid until ${new Date(payload.expiresAt).toISOString()}`,
    payload,
  };
}

/** 生成签名对象的字节（签发端与校验端必须完全一致） */
export function licensePayloadBytes(payload: LicensePayload): Buffer {
  return Buffer.from(JSON.stringify(payload), 'utf8');
}

/** 把 payload + 签名组装成最终凭证字符串（签发端用） */
export function buildLicenseKey(payload: LicensePayload, signature: Buffer): string {
  const b64url = (b: Buffer) =>
    b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${LICENSE_PREFIX}.${b64url(licensePayloadBytes(payload))}.${b64url(signature)}`;
}
