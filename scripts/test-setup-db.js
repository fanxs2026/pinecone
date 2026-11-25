/**
 * Self-contained test for the packaged setup-db.js.
 * Creates a throwaway database, applies db/schema.sql, verifies the table count,
 * then drops everything and restores the package .env.
 *
 * Secrets are read inside Node (never echoed, never on a command line).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

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
const TEST_DB = 'pinecone_setup_test';

function readEnvKey(file, key) {
  if (!fs.existsSync(file)) return '';
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && m[1] === key) return m[2].trim();
  }
  return '';
}

const rootEnv = path.join(ROOT, '.env');

/** Credentials: dedicated keys first, else parse the connection URLs. */
function credsFromUrl(file, key, wantUser) {
  const raw = readEnvKey(file, key);
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.username !== wantUser) return null;
    return decodeURIComponent(u.password);
  } catch {
    return null;
  }
}

const adminPass =
  readEnvKey(rootEnv, 'DB_PASSWORD') ||
  credsFromUrl(rootEnv, 'DIRECT_URL', 'pinecone_admin') ||
  credsFromUrl(rootEnv, 'SHADOW_DATABASE_URL', 'pinecone_admin');
const appPass =
  readEnvKey(rootEnv, 'APP_DB_PASSWORD') ||
  credsFromUrl(rootEnv, 'DATABASE_URL', 'pinecone_app');

if (!adminPass || !appPass) {
  console.log('[test] SKIP: credentials not found in root .env');
  process.exit(0);
}
console.log('[test] credentials loaded (values hidden)');

const pg = require(path.join(PKG, 'apps/backend/node_modules/pg'));

async function dropTestDb() {
  const c = new pg.Client({
    host: '127.0.0.1',
    port: 5432,
    user: 'pinecone_admin',
    password: adminPass,
    database: 'postgres',
  });
  await c.connect();
  // terminate leftovers, then drop
  await c.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [TEST_DB]
  );
  await c.query(`DROP DATABASE IF EXISTS "${TEST_DB}"`);
  await c.end();
}

(async () => {
  const envBackup = path.join(PKG, '.env.testbak');
  if (!fs.existsSync(envBackup)) fs.copyFileSync(path.join(PKG, '.env'), envBackup);

  try {
    await dropTestDb();
  } catch (e) {
    console.log('[test] cleanup(before) warning:', e.message);
  }

  console.log('[test] running packaged setup-db.js against', TEST_DB, '...');
  const r = spawnSync(
    process.execPath,
    [path.join(PKG, 'bin', 'setup-db.js')],
    {
      cwd: PKG,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_OPTIONS: '',
        PINE_SETUP_HOST: '127.0.0.1',
        PINE_SETUP_PORT: '5432',
        PINE_SETUP_SUPERUSER: 'pinecone_admin',
        PINE_SETUP_SUPERPASS: adminPass,
        PINE_SETUP_DB: TEST_DB,
        PINE_SETUP_APPPASS: appPass,
        PINE_SETUP_ADMINPASS: adminPass,
      },
    }
  );

  console.log('--- setup-db output ---');
  console.log((r.stdout || '').trim());
  if (r.stderr && r.stderr.trim()) console.log('[stderr]', r.stderr.trim());
  console.log('[test] exit code:', r.status);

  // verify
  const check = new pg.Client({
    host: '127.0.0.1',
    port: 5432,
    user: 'pinecone_app',
    password: appPass,
    database: TEST_DB,
  });
  let tables = -1;
  let ownerSample = '';
  try {
    await check.connect();
    const t = await check.query(
      "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'"
    );
    tables = t.rows[0].n;
    const o = await check.query(
      "SELECT tableowner FROM pg_tables WHERE schemaname='public' LIMIT 1"
    );
    ownerSample = o.rows[0] ? o.rows[0].tableowner : '(none)';
  } catch (e) {
    console.log('[test] verify failed:', e.message);
  } finally {
    try {
      await check.end();
    } catch {}
  }

  const marker = fs.existsSync(path.join(PKG, '.db-ready'));
  const envText = fs.readFileSync(path.join(PKG, '.env'), 'utf8');
  const urlLine = (envText.match(/^DATABASE_URL=.*$/m) || [''])[0];
  const pointsToTestDb = urlLine.includes('/' + TEST_DB);

  console.log('[test] ----------------------------');
  console.log('[test] tables created :', tables);
  console.log('[test] table owner    :', ownerSample);
  console.log('[test] .db-ready marker:', marker ? 'present' : 'MISSING');
  console.log('[test] .env rewritten  :', pointsToTestDb ? 'yes -> test db' : 'NO');

  const ok = tables >= 60 && marker && pointsToTestDb && r.status === 0;
  console.log('[test] RESULT:', ok ? 'PASS' : 'FAIL');

  // Optional: prove the app boots against a database created by setup-db.js.
  if (ok && process.argv.includes('--boot')) {
    const { spawn } = require('child_process');
    const port = (envText.match(/^BACKEND_PORT=(\d+)$/m) || [null, '3000'])[1];
    console.log('[test] booting backend against the fresh database on port ' + port + ' ...');
    const env = { ...process.env, NODE_ENV: 'production', NODE_OPTIONS: '', REDIS_URL: '' };
    const child = spawn(process.execPath, ['apps/backend/dist/main.js'], {
      cwd: PKG,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let bootLog = '';
    child.stdout.on('data', (d) => (bootLog += d));
    child.stderr.on('data', (d) => (bootLog += d));
    await new Promise((res) => setTimeout(res, 16000));
    let health = 'no-response';
    try {
      const hres = await fetch('http://127.0.0.1:' + port + '/api/health');
      health = hres.status + ' ' + (await hres.text()).slice(0, 60);
    } catch (e) {
      health = 'FAIL ' + e.message;
    }
    console.log('[test] backend started:', /successfully started|API running/.test(bootLog) ? 'YES' : 'NO');
    console.log('[test] /api/health ->', health);
    try {
      child.kill('SIGKILL');
    } catch {}
  }

  // cleanup
  try {
    await dropTestDb();
    console.log('[test] test database dropped');
  } catch (e) {
    console.log('[test] drop warning:', e.message);
  }
  fs.copyFileSync(envBackup, path.join(PKG, '.env'));
  fs.rmSync(envBackup, { force: true });
  fs.rmSync(path.join(PKG, '.db-ready'), { force: true });
  console.log('[test] .env restored, marker removed');
  process.exit(ok ? 0 : 1);
})();
