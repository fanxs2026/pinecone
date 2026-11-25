/**
 * End-to-end check of the enterprise licence gate.
 *
 * Boots the compiled backend four times and asserts the effective edition
 * reported by /api/bootstrap:
 *   valid licence  -> enterprise
 *   no licence     -> community
 *   tampered       -> community
 *   expired        -> community
 *
 * Signs payloads locally with the vendor private key (outside the repo).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PORT = 3999;
const KEY_FILE = path.join(ROOT, '..', 'pinecone-license-keys', 'license-private.pem');

// Optional --pkg=<dir>: run against a staged portable package instead of repo dist
// (a CE build has no @ee payload, so a valid licence legitimately stays community).
const PKG = (process.argv.find((a) => a.startsWith('--pkg=')) || '').slice('--pkg='.length);
const CWD = PKG ? path.resolve(PKG) : ROOT;
const MAIN = PKG ? 'apps/backend/dist/main.js' : 'apps/backend/dist/main.js';

function readEnvKey(file, key) {
  if (!fs.existsSync(file)) return '';
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && m[1] === key) return m[2].trim();
  }
  return '';
}
function fromUrl(file, key, wantUser) {
  const raw = readEnvKey(file, key);
  if (!raw) return '';
  try {
    const u = new URL(raw);
    return u.username === wantUser ? decodeURIComponent(u.password) : '';
  } catch {
    return '';
  }
}

if (!fs.existsSync(KEY_FILE)) {
  console.log('[gate] SKIP: vendor private key not found at ' + KEY_FILE);
  process.exit(0);
}
const privPem = fs.readFileSync(KEY_FILE, 'utf8');
const rootEnv = path.join(ROOT, '.env');
const dbUrl = readEnvKey(rootEnv, 'DATABASE_URL');
if (!dbUrl) {
  console.log('[gate] SKIP: no DATABASE_URL in root .env');
  process.exit(0);
}

const DAY = 86400000;
const b64url = (b) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function issue(opts) {
  const payload = {
    v: 1,
    id: opts.id || 'LIC-E2E',
    customer: opts.customer || 'E2E Customer',
    edition: 'ENTERPRISE',
    seats: 5,
    issuedAt: Date.now() - DAY,
    expiresAt: opts.expiresAt,
  };
  const bytes = Buffer.from(JSON.stringify(payload), 'utf8');
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(bytes);
  signer.end();
  return 'PINECONE-EE.' + b64url(bytes) + '.' + b64url(signer.sign(privPem));
}

function tamper(key) {
  const [prefix, , sig] = key.split('.');
  const bytes = Buffer.from(
    JSON.stringify({
      v: 1,
      id: 'LIC-E2E',
      customer: 'FORGED',
      edition: 'ENTERPRISE',
      seats: 9999,
      issuedAt: Date.now() - DAY,
      expiresAt: Date.now() + 365 * DAY,
    }),
    'utf8'
  );
  return prefix + '.' + b64url(bytes) + '.' + sig;
}

const cases = [
  // 'auto' = enterprise only if this build actually contains the @ee payload
  ['valid licence', issue({ expiresAt: Date.now() + 30 * DAY }), 'auto'],
  ['no licence', '', 'community'],
  ['tampered payload', tamper(issue({ expiresAt: Date.now() + 30 * DAY })), 'community'],
  ['expired licence', issue({ expiresAt: Date.now() - DAY }), 'community'],
  ['garbage key', 'PINECONE-EE.notbase64.notbase64', 'community'],
];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function bootCase(label, licenseKey) {
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    NODE_OPTIONS: '',
    DATABASE_URL: dbUrl,
    PORT: String(PORT),
    REDIS_URL: '',
    HTTPS_ENABLED: 'false',
    PINE_EDITION: 'enterprise', // 声明要跑企业版，能否生效取决于 license
    PINE_LICENSE_KEY: licenseKey,
    JWT_ACCESS_SECRET: 'x'.repeat(48),
    JWT_REFRESH_SECRET: 'y'.repeat(48),
  };
  const child = spawn(process.execPath, [MAIN], {
    cwd: CWD,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));

  await wait(14000);
  let edition = '(no response)';
  let licenseState = '';
  let payloadPresent = '';
  try {
    const r = await fetch('http://127.0.0.1:' + PORT + '/api/bootstrap');
    const body = await r.json();
    edition = body.edition;
    licenseState = body.license ? body.license.state : '';
    payloadPresent = body.eePayloadPresent ? 'present' : 'absent';
  } catch {}
  try {
    child.kill('SIGKILL');
  } catch {}
  await wait(600);

  const banner = (log.match(/\[Edition\].*/) || [''])[0].trim();
  return { label, edition, licenseState, payloadPresent, banner };
}

(async () => {
  console.log('[gate] PINE_EDITION=enterprise for every case; only the licence differs\n');
  if (PKG) {
    // the package resolves @ee through a junction created at start-up
    const { spawnSync } = require('child_process');
    const link = spawnSync(process.execPath, ['bin/link-ee.js'], { cwd: CWD, encoding: 'utf8' });
    console.log('[gate] link-ee: ' + ((link.stdout || '').trim() || '(no-op)'));
  }
  let failures = 0;
  for (const [label, key, expected] of cases) {
    const r = await bootCase(label, key);
    const want = expected === 'auto' ? (r.payloadPresent === 'present' ? 'enterprise' : 'community') : expected;
    const ok = r.edition === want;
    if (!ok) failures++;
    console.log(
      `[gate] ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(17)} edition=${String(r.edition).padEnd(11)} ` +
        `licence=${(r.licenseState || '-').padEnd(14)} ee-payload=${r.payloadPresent || '-'}`
    );
    if (r.banner) console.log('        ' + r.banner.slice(0, 150));
  }
  console.log('\n[gate] RESULT:', failures === 0 ? 'ALL PASS' : failures + ' FAILED');
  process.exit(failures === 0 ? 0 : 1);
})();
