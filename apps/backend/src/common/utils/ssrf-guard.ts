import { BadRequestException } from '@nestjs/common';
import { lookup } from 'dns/promises';
import { isIP } from 'net';

/**
 * 出站请求 SSRF 防护（2026-08-19，上线前全检 B3 修复）。
 *
 * 原则：默认 fail-closed——仅允许 http/https，拦截：
 *  - 带凭据的 URL（user:pass@host）
 *  - 字面量私网/回环/链路本地/元数据/CGNAT/保留段 IP（IPv4 + IPv6）
 *  - DNS 解析结果命中私网段（防 DNS rebinding）
 *
 * 开发豁免：环境变量 WEBHOOK_ALLOW_PRIVATE_NETWORK=true 时跳过私网 IP 拦截
 * （仅限本地联调 webhook，生产严禁开启）。
 */

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata', 'metadata.google.internal']);

const DNS_TIMEOUT_MS = 5_000;

/** IPv4 私网/特殊段判断（含 0/8、127/8、10/8、172.16/12、192.168/16、169.254/16 元数据、100.64/10、198.18/15、192.0.0/24、≥224 组播/保留） */
function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local 含 169.254.169.254 云元数据
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 192 && b === 0) return true; // 192.0.0.0/24
  if (a >= 224) return true; // 组播/保留
  return false;
}

/** IPv6 特殊段判断（::、::1、fc00::/7、fe80::/10、ff00::/8、IPv4-mapped） */
function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // ULA
  if (/^fe[89ab]/.test(lower)) return true; // link-local
  if (lower.startsWith('ff')) return true; // multicast
  const v4mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4mapped) return isPrivateIpv4(v4mapped[1]);
  return false;
}

function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return isPrivateIpv4(ip);
  if (v === 6) return isPrivateIpv6(ip);
  return true; // 无法识别 → 按私网处理（fail-closed）
}

function normalizeHost(host: string): string {
  // URL.hostname 对 IPv6 字面量可能带方括号，去掉以便 isIP/lookup
  return host.replace(/^\[(.*)\]$/, '$1');
}

/**
 * 校验出站 URL 安全。不通过抛 BadRequestException（400）。
 * @param rawUrl 待校验 URL
 * @param allowPrivate 开发豁免（对应 WEBHOOK_ALLOW_PRIVATE_NETWORK）
 */
export async function assertSafeOutboundUrl(rawUrl: string, allowPrivate = false): Promise<void> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new BadRequestException('Invalid URL');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new BadRequestException('Only http/https URLs are allowed for outbound delivery');
  }
  if (u.username || u.password) {
    throw new BadRequestException('URL must not contain credentials');
  }
  const hostRaw = u.hostname;
  if (BLOCKED_HOSTNAMES.has(hostRaw.toLowerCase())) {
    throw new BadRequestException('URL host is blocked');
  }
  const host = normalizeHost(hostRaw);

  if (!allowPrivate && isIP(host) !== 0 && isPrivateIp(host)) {
    throw new BadRequestException('URL targets a private/blocked IP');
  }

  if (isIP(host) !== 0) return; // 字面量公网 IP：无需 DNS 再校验

  // DNS 解析（all 记录）→ 二次校验，防 rebinding
  let addrs: { address: string }[];
  try {
    addrs = await Promise.race([
      lookup(host, { all: true, verbatim: true }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('DNS lookup timed out')), DNS_TIMEOUT_MS),
      ),
    ]);
  } catch {
    throw new BadRequestException(`URL host cannot be resolved: ${hostRaw}`);
  }
  for (const a of addrs) {
    if (!allowPrivate && isPrivateIp(a.address)) {
      throw new BadRequestException(`URL resolves to a private/blocked IP (${a.address})`);
    }
  }
}

/** 读取开发豁免开关（WEBHOOK_ALLOW_PRIVATE_NETWORK=true） */
export function isPrivateNetworkAllowed(): boolean {
  return process.env.WEBHOOK_ALLOW_PRIVATE_NETWORK === 'true';
}
