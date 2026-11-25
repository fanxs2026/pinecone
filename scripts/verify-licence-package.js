/**
 * Verify the EE package with its baked-in licence:
 *   1. boot + /api/bootstrap shows enterprise with the expected expiry
 *   2. the public /api/license/validate endpoint accepts the same key
 *   3. an EE endpoint is mounted (401, not 404)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PKG = path.join(ROOT, 'dist/portable/pinecone-ee-portable-1.0.1-win-x64');
const NODE = path.join(PKG, 'node', 'node.exe');

function readEnvKey(file, key) {
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && m[1] === key) return m[2].trim();
  }
  return '';
}
function fromUrl(file, key, user) {
  const raw = readEnvKey(file, key);
  try {
    const u = new URL(raw);
    return u.username === user ? decodeURIComponent(u.password) : '';
  } catch {
    return '';
  }
}

const rootEnv = path.join(ROOT, '.env');
const dbUrl = readEnvKey(rootEnv, 'DATABASE_URL') || '';
if (!dbUrl) {
  console.log('[lic] SKIP: no DATABASE_URL');
  process.exit(0);
}
const licenceFromPkg = readEnvKey(path.join(PKG, '.env'), 'PINE_LICENSE_KEY');
// --key-file=<path> lets us test a separately delivered licence file
// (packages no longer ship a licence, so the bundled value is normally empty).
const keyFileArg = (process.argv.find((a) => a.startsWith('--key-file=')) || '').slice('--key-file='.length);
let licence = licenceFromPkg;
if (keyFileArg) {
  const text = fs.readFileSync(keyFileArg, 'utf8');
  const m = text.match(/PINE_LICENSE_KEY=(.+)/);
  if (m) licence = m[1].trim();
}
if (!licence) {
  console.log('[lic] SKIP: no licence (package ships none; pass --key-file=<path>)');
  process.exit(0);
}
console.log('[lic] licence source:', keyFileArg ? path.basename(keyFileArg) : 'package .env');
const port = readEnvKey(path.join(PKG, '.env'), 'BACKEND_PORT') || '3000';

const env = {
  ...process.env,
  NODE_ENV: 'production',
  NODE_OPTIONS: '',
  REDIS_URL: '',
  HTTPS_ENABLED: 'false',
  DATABASE_URL: dbUrl, // package .env still has CHANGE_ME placeholders
};
env.PINE_LICENSE_KEY = licence; // explicit: package .env no longer carries one
delete env.PINE_EDITION;

spawnSync(NODE, [path.join(PKG, 'bin', 'link-ee.js')], { cwd: PKG, env, encoding: 'utf8' });

const child = spawn(NODE, ['apps/backend/dist/main.js'], { cwd: PKG, env, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
child.stdout.on('data', (d) => (log += d));
child.stderr.on('data', (d) => (log += d));

(async () => {
  await new Promise((r) => setTimeout(r, 16000));
  const started = /successfully started|API running/.test(log);
  console.log('[lic] backend started:', started ? 'YES' : 'NO');
  if (!started) {
    console.log(log.split(/\r?\n/).slice(0, 14).join('\n'));
    try {
      child.kill('SIGKILL');
    } catch {}
    process.exit(1);
  }

  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/bootstrap`);
    const b = await r.json();
    console.log('[lic] bootstrap edition   :', b.edition, '(declared', b.declaredEdition + ')');
    console.log('[lic] licence             :', b.license && b.license.state, '|', b.license && b.license.customer);
    console.log('[lic] expires             :', b.license && new Date(b.license.expiresAt).toISOString());
    console.log('[lic] ee-payload          :', b.eePayloadPresent);
    console.log('[lic] enterprise features :', (b.enterpriseFeatures || []).length);
  } catch (e) {
    console.log('[lic] bootstrap FAIL', e.message);
  }

  try {
    const r = await fetch(
      `http://127.0.0.1:${port}/api/license/validate?key=${encodeURIComponent(licence)}`
    );
    const body = await r.json();
    console.log('[lic] validate endpoint   :', JSON.stringify(body).slice(0, 180));
  } catch (e) {
    console.log('[lic] validate FAIL', e.message);
  }

  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/admin/licenses`);
    console.log('[lic] /api/admin/licenses :', r.status, r.status === 401 ? '(mounted)' : '');
  } catch {}

  const banner = (log.match(/\[Edition\].*/g) || []).join('\n');
  console.log('[lic] banner              :', banner.trim());

  const lines = log.split(/\r?\n/);
  const at = lines.findIndex((l) => /ExceptionsHandler/.test(l));
  if (at >= 0) {
    console.log('[lic] ---- server error ----');
    console.log(lines.slice(at, at + 14).join('\n'));
  }

  try {
    child.kill('SIGKILL');
  } catch {}
  // drop the junction so a later pack does not recurse into it
  try {
    const link = path.join(PKG, 'apps/backend/node_modules/@ee');
    if (fs.lstatSync(link, { throwIfNoEntry: false })) fs.unlinkSync(link);
  } catch {}
  process.exit(0);
})();
