/** Boot the EE package and prove enterprise modules are actually loaded. */
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
    .filter((n) => fs.statSync(path.join(PORTABLE, n)).isDirectory() && n.includes('-ee-'))
    .sort()
    .pop()
);
if (!PKG) {
  console.log('[ee] no enterprise package staged');
  process.exit(0);
}
console.log('[ee] package:', path.basename(PKG));

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

const rootEnv = path.join(ROOT, '.env');
const appPass = readEnvKey(rootEnv, 'APP_DB_PASSWORD') || fromUrl(rootEnv, 'DATABASE_URL', 'pinecone_app');
const pkgPort = readEnvKey(path.join(PKG, '.env'), 'BACKEND_PORT') || '3000';

const env = { ...process.env, NODE_ENV: 'production', NODE_OPTIONS: '', REDIS_URL: '', HTTPS_ENABLED: 'false' };
delete env.PINE_EDITION; // let the package .env decide

// run-backend.cmd does this first; replicate it so the test matches production.
const link = require('child_process').spawnSync(
  path.join(PKG, 'node', 'node.exe'),
  [path.join(PKG, 'bin', 'link-ee.js')],
  { cwd: PKG, env, encoding: 'utf8' }
);
console.log('[ee] link step:', (link.stdout || '').trim() || '(no-op)', link.status === 0 ? '' : 'exit=' + link.status);

const child = spawn(path.join(PKG, 'node', 'node.exe'), ['apps/backend/dist/main.js'], {
  cwd: PKG,
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
child.stdout.on('data', (d) => (log += d));
child.stderr.on('data', (d) => (log += d));

(async () => {
  await new Promise((r) => setTimeout(r, 16000));
  const started = /successfully started|API running/.test(log);
  console.log('[ee] backend started:', started ? 'YES' : 'NO');
  if (!started) {
    console.log('[ee] ---- log head ----');
    console.log(log.split(/\r?\n/).slice(0, 22).join('\n'));
  }

  // Which EE controllers got registered? CE never mounts these.
  const eeRoutes = ['licenses', 'api-tokens', 'scim', 'sso', 'audit', 'webhooks', 'okr', 'teams', 'trash'];
  const mounted = eeRoutes.filter((r) => log.includes('/' + r));
  console.log('[ee] enterprise routes mounted:', mounted.length, '->', mounted.join(', ') || '(none)');

  for (const url of ['http://127.0.0.1:' + pkgPort + '/api/health', 'http://127.0.0.1:' + pkgPort + '/api/bootstrap']) {
    try {
      const r = await fetch(url);
      const t = await r.text();
      console.log('[ee]', url.replace(/^https?:\/\/[^/]+/, ''), '->', r.status, t.slice(0, 120));
    } catch (e) {
      console.log('[ee]', url, '-> FAIL', e.message);
    }
  }

  // EE-only endpoints: 401/403 proves the route exists (401) vs missing (404).
  for (const p of ['/api/admin/licenses', '/api/api-tokens', '/api/okr/objectives']) {
    try {
      const r = await fetch('http://127.0.0.1:' + pkgPort + p);
      console.log('[ee] route', p, '->', r.status, r.status === 404 ? '(NOT MOUNTED)' : '(mounted)');
    } catch (e) {
      console.log('[ee] route', p, '-> FAIL', e.message);
    }
  }

  const licenseWarn = /license|License/.test(log);
  console.log('[ee] log mentions license:', licenseWarn ? 'yes' : 'no');

  try {
    child.kill('SIGKILL');
  } catch {}

  // Leave no junction behind: a recursive delete through it stalls the packer.
  try {
    const link = path.join(PKG, 'apps/backend/node_modules/@ee');
    const st = fs.lstatSync(link, { throwIfNoEntry: false });
    if (st && st.isSymbolicLink()) {
      fs.unlinkSync(link);
      console.log('[ee] @ee junction cleaned up');
    }
  } catch (e) {
    console.log('[ee] junction cleanup:', e.code);
  }
  process.exit(0);
})();
