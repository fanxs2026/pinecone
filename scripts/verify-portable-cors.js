/**
 * Verify CORS behaviour for the portable package:
 *   - same-host origin (LAN IP, different port) must be granted
 *   - unrelated external origin must be denied
 *   - strict allowlist (FRONTEND_URL) keeps working
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PORTABLE = path.join(ROOT, 'dist/portable');
const PKG = path.join(
  PORTABLE,
  fs
    .readdirSync(PORTABLE)
    .filter((n) => fs.statSync(path.join(PORTABLE, n)).isDirectory())
    .sort()
    .pop()
);

function readEnvKey(file, key) {
  if (!fs.existsSync(file)) return '';
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && m[1] === key) return m[2].trim();
  }
  return '';
}

const dbUrl = readEnvKey(path.join(ROOT, '.env'), 'DATABASE_URL');
if (!dbUrl) {
  console.log('[cors] SKIP: no DATABASE_URL in root .env');
  process.exit(0);
}

// .env wins over process env (loadEnv uses override), so probe the configured port.
const PORT = Number(readEnvKey(path.join(PKG, '.env'), 'BACKEND_PORT') || 3000);
const env = {
  ...process.env,
  NODE_ENV: 'production',
  DATABASE_URL: dbUrl,
  BACKEND_PORT: String(PORT),
  HTTPS_ENABLED: 'false',
  REDIS_URL: '',
  CORS_ALLOW_SAME_HOST: 'true',
  FRONTEND_URL: 'http://localhost:6173',
  JWT_ACCESS_SECRET: 'x'.repeat(48),
  JWT_REFRESH_SECRET: 'y'.repeat(48),
};
delete env.NODE_OPTIONS;

const child = spawn(path.join(PKG, 'node', 'node.exe'), ['apps/backend/dist/main.js'], {
  cwd: PKG,
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
child.stdout.on('data', (d) => (log += d));
child.stderr.on('data', (d) => (log += d));

const probe = async (label, origin, expect, host = '127.0.0.1') => {
  const url = `http://${host}:${PORT}/api/auth/login`;
  try {
    const r = await fetch(url, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    });
    const allow = r.headers.get('access-control-allow-origin');
    const ok = expect ? allow === origin : !allow;
    console.log(`[cors] ${ok ? 'PASS' : 'FAIL'} ${label}  status=${r.status} allow-origin=${allow}`);
    return ok;
  } catch (e) {
    console.log(`[cors] FAIL ${label} -> ${e.message}`);
    return false;
  }
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await wait(15000);
  const started = /Nest application successfully started|API running/.test(log);
  console.log('[cors] backend started:', started ? 'YES' : 'NO');
  if (!started) {
    console.log(log.split(/\r?\n/).slice(0, 12).join('\n'));
    try {
      child.kill('SIGKILL');
    } catch {}
    process.exit(1);
  }

  const results = [];
  results.push(await probe('allowlist localhost:6173', 'http://localhost:6173', true));
  results.push(await probe('same-host LAN IP:6180', 'http://192.168.176.1:6180', true, '192.168.176.1'));
  results.push(await probe('loopback other port', 'http://127.0.0.1:6180', true));
  results.push(await probe('external evil origin', 'http://evil.example.com', false));

  try {
    child.kill('SIGKILL');
  } catch {}
  process.exit(results.every(Boolean) ? 0 : 1);
})();
