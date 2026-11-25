/**
 * 端到端验证「首个注册用户自动成为平台管理员」。
 *
 * 在一次性数据库上跑，不碰开发库：
 *   1. 建库 + 应用 db/schema.sql
 *   2. 以 FIRST_USER_BECOMES_ADMIN=true、REGISTRATION_MODE=open 启动后端
 *   3. 注册第 1 个用户 → 断言 isSystemAdmin=true 且管理员接口返回 200
 *   4. 注册第 2 个用户 → 断言 isSystemAdmin=false 且管理员接口返回 403
 *   5. 删除测试库
 *
 * 凭据从仓库根 .env 读取（DIRECT_URL 取超级用户、DATABASE_URL 取应用账号），不打印。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PKG_NM = path.join(ROOT, 'apps/backend/node_modules');
const pg = require(path.join(PKG_NM, 'pg'));
const TEST_DB = 'pinecone_first_admin_test';
const PORT = 3996;

// --pkg=<dir>：对着已打包的产物跑（验证真实交付物，而不只是仓库 dist）
const PKG_ARG = (process.argv.find((a) => a.startsWith('--pkg=')) || '').slice('--pkg='.length);
const CWD = PKG_ARG ? path.resolve(PKG_ARG) : ROOT;
const EXE = PKG_ARG ? path.join(CWD, 'node', 'node.exe') : process.execPath;

function readEnvKey(file, key) {
  if (!fs.existsSync(file)) return '';
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && m[1] === key) return m[2].trim();
  }
  return '';
}
function urlParts(raw) {
  try {
    const u = new URL(raw);
    return {
      host: u.hostname,
      port: Number(u.port || 5432),
      user: u.username,
      password: decodeURIComponent(u.password),
      database: u.pathname.slice(1),
    };
  } catch {
    return null;
  }
}

const rootEnv = path.join(ROOT, '.env');
const adminUrl = urlParts(readEnvKey(rootEnv, 'DIRECT_URL') || readEnvKey(rootEnv, 'SHADOW_DATABASE_URL'));
const appUrl = urlParts(readEnvKey(rootEnv, 'DATABASE_URL'));
const schemaFile = path.join(ROOT, 'scripts/portable/db/schema.sql');

if (!adminUrl || !appUrl || !fs.existsSync(schemaFile)) {
  console.log('[fa] SKIP: missing DIRECT_URL / DATABASE_URL / schema.sql');
  process.exit(0);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** 指向一次性测试库的连接串（绝不能用开发库的 DATABASE_URL） */
const TEST_DATABASE_URL =
  `postgresql://${appUrl.user}:${encodeURIComponent(appUrl.password)}` +
  `@${appUrl.host}:${appUrl.port}/${TEST_DB}?schema=public`;

async function dropDb() {
  const c = new pg.Client({ ...adminUrl, database: 'postgres' });
  await c.connect();
  await c.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [TEST_DB]
  );
  await c.query(`DROP DATABASE IF EXISTS "${TEST_DB}"`);
  await c.end();
}

async function prepareDb() {
  await dropDb();
  const su = new pg.Client({ ...adminUrl, database: 'postgres' });
  await su.connect();
  await su.query(`CREATE DATABASE "${TEST_DB}" OWNER ${appUrl.user} ENCODING 'UTF8'`);
  await su.end();

  const owner = new pg.Client({ ...appUrl, database: TEST_DB });
  await owner.connect();
  const sql = fs
    .readFileSync(schemaFile, 'utf8')
    .split(/\r?\n/)
    .filter((l) => !l.trimStart().startsWith('\\'))
    .join('\n');
  await owner.query('BEGIN');
  await owner.query(sql);
  await owner.query('COMMIT');
  const n = await owner.query(
    "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'"
  );
  await owner.end();
  return n.rows[0].n;
}

function bootBackend() {
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    NODE_OPTIONS: '',
    HTTPS_ENABLED: 'false',
    REDIS_URL: '',
    PORT: String(PORT),
    DATABASE_URL: TEST_DATABASE_URL, // 必须是测试库：写成开发库会污染真实数据
    REGISTRATION_MODE: 'open',
    FIRST_USER_BECOMES_ADMIN: 'true',
    REGISTRATION_ADMIN_EMAILS: 'change me to your email',
    JWT_ACCESS_SECRET: 'x'.repeat(48),
    JWT_REFRESH_SECRET: 'y'.repeat(48),
  };
  const child = spawn(EXE, ['apps/backend/dist/main.js'], {
    cwd: CWD,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  return { child, getLog: () => log };
}

const api = (p) => `http://127.0.0.1:${PORT}/api${p}`;

async function register(email) {
  const r = await fetch(api('/auth/register'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      // 运行时生成，仓库里不留任何像凭据的字面量（gitleaks 门禁会扫脚本）
      password: 'E2e' + Date.now().toString(36) + 'a1',
      name: email.split('@')[0],
    }),
  });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body };
}

async function hitAdmin(token) {
  const r = await fetch(api('/registration-admin/whitelist'), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return r.status;
}

(async () => {
  let results = [];
  let boot;
  try {
    const tables = await prepareDb();
    console.log('[fa] test db ready, tables =', tables);

    boot = bootBackend();
    await wait(15000);
    const health = await fetch(api('/health')).then((r) => r.status).catch(() => 0);
    console.log('[fa] backend health =', health);
    if (health !== 200) {
      console.log(boot.getLog().split(/\r?\n/).slice(0, 12).join('\n'));
      throw new Error('backend did not start');
    }

    const first = await register('first@example.test');
    const firstAdmin = first.body?.user?.isSystemAdmin === true;
    const firstStatus = await hitAdmin(first.body?.accessToken);

    // 直接查库，区分「没授予」与「响应没带出来」
    const probe = new pg.Client({ ...appUrl, database: TEST_DB });
    await probe.connect();
    const rows = await probe.query('SELECT email, "isSystemAdmin" FROM users ORDER BY "createdAt"');
    await probe.end();
    console.log('[fa] db rows:', JSON.stringify(rows.rows));
    const flagLines = boot
      .getLog()
      .split(/\r?\n/)
      .filter((l) => /PlatformAdmin|FIRST_USER|granted/i.test(l));
    if (flagLines.length) console.log('[fa] log:', flagLines.join(' | '));
    else console.log('[fa] log: (无授予日志)');

    // start.bat 依赖这个纯 ASCII 标记，缺失则客户端看不到首次部署提示
    const markerSeen = boot.getLog().includes('FIRST-RUN-ADMIN-PENDING');
    console.log('[fa] first-run marker in log:', markerSeen);
    results.push(['startup prints FIRST-RUN-ADMIN-PENDING', markerSeen]);
    console.log(
      `[fa] 1st user: register=${first.status} isSystemAdmin=${firstAdmin} adminApi=${firstStatus}`
    );
    results.push(['first user becomes admin', firstAdmin && firstStatus === 200]);

    const second = await register('second@example.test');
    const secondAdmin = second.body?.user?.isSystemAdmin === true;
    const secondStatus = await hitAdmin(second.body?.accessToken);
    console.log(
      `[fa] 2nd user: register=${second.status} isSystemAdmin=${secondAdmin} adminApi=${secondStatus}`
    );
    results.push(['second user is NOT admin', secondAdmin === false && secondStatus === 403]);
  } catch (e) {
    console.log('[fa] ERROR:', e.message);
    results.push(['setup', false]);
  } finally {
    try {
      boot && boot.child.kill('SIGKILL');
    } catch {}
    await wait(800);
    try {
      await dropDb();
      console.log('[fa] test db dropped');
    } catch (e) {
      console.log('[fa] drop warning:', e.message);
    }
  }

  console.log('');
  for (const [name, ok] of results) console.log(`[fa] ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  process.exit(results.every(([, ok]) => ok) ? 0 : 1);
})();
