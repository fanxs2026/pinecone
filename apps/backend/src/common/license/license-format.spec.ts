import { createSign, generateKeyPairSync } from 'crypto';
import { buildLicenseKey, licensePayloadBytes, verifyLicense, type LicensePayload } from './license-format';

/**
 * license 凭证验签的边界测试。
 *
 * 测试自带密钥对（不依赖仓库里的真实公钥），覆盖：有效 / 过期 / 篡改 /
 * 格式错 / 版本不符 —— 这些正是「降级社区版」的全部触发条件。
 */
describe('license-format', () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const pubB64 = Buffer.from(publicKey, 'utf8').toString('base64');

  const NOW = Date.UTC(2026, 0, 15, 0, 0, 0);
  const DAY = 24 * 60 * 60 * 1000;

  const basePayload = (over: Partial<LicensePayload> = {}): LicensePayload => ({
    v: 1,
    id: 'LIC-TEST-001',
    customer: 'ACME Ltd',
    edition: 'ENTERPRISE',
    seats: 10,
    issuedAt: NOW - DAY,
    expiresAt: NOW + 30 * DAY,
    ...over,
  });

  const sign = (payload: LicensePayload): string => {
    const signer = createSign('RSA-SHA256');
    signer.update(licensePayloadBytes(payload));
    signer.end();
    return buildLicenseKey(payload, signer.sign(privateKey));
  };

  it('接受有效凭证', () => {
    const status = verifyLicense(sign(basePayload()), NOW, pubB64);
    expect(status.state).toBe('licensed');
    expect(status.payload?.customer).toBe('ACME Ltd');
  });

  it('缺省 key 视为 missing', () => {
    expect(verifyLicense(undefined, NOW, pubB64).state).toBe('missing');
    expect(verifyLicense('   ', NOW, pubB64).state).toBe('missing');
  });

  it('过期凭证判定为 expired', () => {
    const key = sign(basePayload({ expiresAt: NOW - 1 }));
    const status = verifyLicense(key, NOW, pubB64);
    expect(status.state).toBe('expired');
    expect(status.expiredAt).toBe(NOW - 1);
  });

  it('expiresAt 恰好等于当前时间即视为过期（边界）', () => {
    expect(verifyLicense(sign(basePayload({ expiresAt: NOW })), NOW, pubB64).state).toBe('expired');
  });

  it('篡改 payload 后签名不匹配', () => {
    const key = sign(basePayload());
    const [prefix, payloadPart, sigPart] = key.split('.');
    const forged = basePayload({ seats: 9999, customer: 'EVIL Ltd' });
    const forgedPart = Buffer.from(JSON.stringify(forged), 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const status = verifyLicense(`${prefix}.${forgedPart}.${sigPart}`, NOW, pubB64);
    expect(status.state).toBe('bad-signature');
  });

  it('换一对密钥签发的凭证不被接受', () => {
    const other = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const signer = createSign('RSA-SHA256');
    signer.update(licensePayloadBytes(basePayload()));
    signer.end();
    const key = buildLicenseKey(basePayload(), signer.sign(other.privateKey));
    expect(verifyLicense(key, NOW, pubB64).state).toBe('bad-signature');
  });

  it.each([
    ['段数不足', 'PINECONE-EE.abc'],
    ['前缀错误', 'PINECONE-CE.abc.def'],
    ['payload 非 base64', 'PINECONE-EE.@@@.@@@'],
  ])('格式错误（%s）判定为 malformed', (_label, key) => {
    expect(verifyLicense(key, NOW, pubB64).state).toBe('malformed');
  });

  it('签发非企业版凭证被拒', () => {
    const status = verifyLicense(sign(basePayload({ edition: 'COMMUNITY' as never })), NOW, pubB64);
    expect(status.state).toBe('wrong-edition');
  });

  it('缺少 expiresAt 判定为 malformed', () => {
    const payload = basePayload();
    delete (payload as Partial<LicensePayload>).expiresAt;
    expect(verifyLicense(sign(payload as LicensePayload), NOW, pubB64).state).toBe('malformed');
  });
});
