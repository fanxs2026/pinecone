import { assertSafeOutboundUrl } from './ssrf-guard';

/**
 * F-12 安全回归测试（2026-08-19 上线前全检）：
 * SSRF 防护——协议白名单 / 私网/metadata 拦截 / 凭据拦截 / 开发豁免。
 * 全部使用字面量 IP，避免单元测试依赖 DNS/网络。
 */
describe('ssrf-guard (B3/F-12)', () => {
  it('allows public https URL', async () => {
    await expect(assertSafeOutboundUrl('https://example.com/api', false)).resolves.toBeUndefined();
  });

  it('allows public http URL', async () => {
    await expect(assertSafeOutboundUrl('http://example.com/hook', false)).resolves.toBeUndefined();
  });

  it('blocks cloud metadata IP 169.254.169.254', async () => {
    await expect(assertSafeOutboundUrl('http://169.254.169.254/latest/meta-data', false)).rejects.toThrow(/private\/blocked/);
  });

  it('blocks loopback IPv4', async () => {
    await expect(assertSafeOutboundUrl('http://127.0.0.1:8080/hook', false)).rejects.toThrow(/private\/blocked/);
  });

  it('blocks loopback IPv6 [::1]', async () => {
    await expect(assertSafeOutboundUrl('http://[::1]:3000/hook', false)).rejects.toThrow(/private\/blocked/);
  });

  it('blocks RFC1918 private ranges (10/8, 172.16/12, 192.168/16)', async () => {
    await expect(assertSafeOutboundUrl('http://10.0.0.1/x', false)).rejects.toThrow(/private\/blocked/);
    await expect(assertSafeOutboundUrl('http://172.16.5.5/x', false)).rejects.toThrow(/private\/blocked/);
    await expect(assertSafeOutboundUrl('http://192.168.1.10/x', false)).rejects.toThrow(/private\/blocked/);
  });

  it('blocks non-http(s) protocols', async () => {
    await expect(assertSafeOutboundUrl('ftp://example.com/x', false)).rejects.toThrow(/Only http\/https/);
    await expect(assertSafeOutboundUrl('file:///etc/passwd', false)).rejects.toThrow(/Only http\/https/);
  });

  it('blocks URLs with embedded credentials', async () => {
    await expect(assertSafeOutboundUrl('http://user:pass@example.com/', false)).rejects.toThrow(/credentials/);
  });

  it('blocks reserved hostname localhost before DNS', async () => {
    await expect(assertSafeOutboundUrl('http://localhost:8080/hook', false)).rejects.toThrow(/blocked/);
  });

  it('honors allowPrivate dev exemption for private IPs, but not blocked hostnames', async () => {
    const prev = process.env.WEBHOOK_ALLOW_PRIVATE_NETWORK;
    process.env.WEBHOOK_ALLOW_PRIVATE_NETWORK = 'true';
    try {
      // 豁免仅作用于私网 IP 段；硬编码主机名黑名单（localhost 等）始终拦截
      await expect(assertSafeOutboundUrl('http://192.168.1.10/hook', true)).resolves.toBeUndefined();
      await expect(assertSafeOutboundUrl('http://localhost:8080/hook', true)).rejects.toThrow(/blocked/);
    } finally {
      if (prev === undefined) delete process.env.WEBHOOK_ALLOW_PRIVATE_NETWORK;
      else process.env.WEBHOOK_ALLOW_PRIVATE_NETWORK = prev;
    }
  });
});
