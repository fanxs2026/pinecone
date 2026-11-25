import { verifyLicense, type LicenseStatus } from './license-format';

/**
 * license 状态解析（进程内单例 + 短期缓存）。
 *
 * 设计取舍：
 *   - 验签是纯 CPU 操作（~0.1ms），但没必要每个请求都做，缓存 60s；
 *   - **到期立刻失效不受缓存影响**：命中缓存后仍会用当前时间比对 expiresAt，
 *     所以「跑着跑着到期了」最多 0 秒延迟，不需要重启；
 *   - 只信任内置公钥，见 public-key.ts 的说明。
 */

const CACHE_TTL_MS = 60_000;

let cached: { status: LicenseStatus; at: number } | null = null;

export function getLicenseStatus(force = false): LicenseStatus {
  const now = Date.now();

  if (!force && cached && now - cached.at < CACHE_TTL_MS) {
    const hit = cached.status;
    // 缓存期内也要检查到期：许可证到期即刻降级，不需要等 TTL 走完
    if (hit.state === 'licensed' && hit.payload && hit.payload.expiresAt <= now) {
      cached = null;
    } else {
      return hit;
    }
  }

  const status = verifyLicense(process.env.PINE_LICENSE_KEY, now);
  cached = { status, at: now };
  return status;
}

/** 是否持有当前有效的企业版授权 */
export function isLicensed(): boolean {
  return getLicenseStatus().state === 'licensed';
}

/** 启动横幅用的一行摘要 */
export function describeLicense(): string {
  const s = getLicenseStatus(true);
  switch (s.state) {
    case 'licensed':
      return `licensed to ${s.payload?.customer || '(unnamed)'} until ${new Date(
        s.payload!.expiresAt
      ).toISOString()}`;
    case 'missing':
      return 'no licence key (PINE_LICENSE_KEY is empty)';
    case 'expired':
      return `expired at ${new Date(s.expiredAt!).toISOString()}`;
    default:
      return `${s.state}: ${s.reason}`;
  }
}

/** 仅供测试使用：清掉缓存，让下一次调用重新解析 */
export function __resetLicenseCache(): void {
  cached = null;
}
