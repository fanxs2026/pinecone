'use strict';
/**
 * 便携版建库实测：新建临时库 → 原样执行 db/schema.sql → 用 verify-db-schema 做完整比对 → 删库。
 *
 * 这是「部署包建库」这条路的真实演练，比文件级比对更能说明问题：
 *   · schema.sql 里的 DO 块 / ALTER 是否真的执行成功
 *   · 增量补齐区是否把快照的缺口补上了
 *   · 最终结构是否与 prisma/schema.prisma 完全一致
 *
 * 需要 admin 权限建库（.env 的 DIRECT_URL）。
 *   node scripts/verify-portable-fresh-db.js
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DB = 'pinecone_schema_verify';
const SQL_FILE = path.join(ROOT, 'scripts', 'portable', 'db', 'schema.sql');

function readEnv() {
  const file = path.join(ROOT, '.env');
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const l = raw.trim();
    if (!l || l.startsWith('#')) continue;
    const i = l.indexOf('=');
    if (i < 1) continue;
    out[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^"(.*)"$/, '$1');
  }
  return out;
}

(async () => {
  const env = readEnv();
  const base = env.DIRECT_URL || env.DATABASE_URL;
  if (!base) { console.error('缺少 DIRECT_URL / DATABASE_URL'); process.exit(1); }

  const adminUrl = new URL(base);
  adminUrl.pathname = '/postgres';
  const tmpUrl = new URL(base);
  tmpUrl.pathname = '/' + DB;

  const { requirePg } = require('./lib/pg');
  const pg = requirePg(ROOT);

  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  console.log('[1] 重建临时库 ' + DB + ' ...');
  await admin.query('DROP DATABASE IF EXISTS ' + DB + ' WITH (FORCE)');
  await admin.query('CREATE DATABASE ' + DB);
  await admin.end();

  const sql = fs.readFileSync(SQL_FILE, 'utf8');
  const c = new pg.Client({ connectionString: tmpUrl.toString() });
  c.on('notice', (n) => {
    if (/skip/i.test(n.message)) console.log('    NOTICE: ' + n.message);
  });
  await c.connect();
  console.log('[2] 执行 db/schema.sql (' + Math.round(sql.length / 1024) + ' KB) ...');
  await c.query('BEGIN');
  try {
    await c.query(sql);
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('schema.sql 执行失败：' + e.message);
    await c.end();
    await cleanup();
    process.exit(1);
  }
  const stat = await c.query(
    `SELECT (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE')::int AS tables,
            (SELECT count(*) FROM pg_indexes WHERE schemaname='public')::int AS indexes,
            (SELECT count(*) FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace)::int AS fks`,
  );
  console.log('    表=' + stat.rows[0].tables + ' 索引=' + stat.rows[0].indexes + ' 外键=' + stat.rows[0].fks);
  await c.end();

  console.log('[3] 结构与 schema.prisma 比对 ...');
  const cleanEnv = { ...process.env };
  delete cleanEnv.NODE_OPTIONS;
  const check = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'verify-db-schema.js'), '--url=' + tmpUrl.toString()], {
    cwd: ROOT,
    env: cleanEnv,
    encoding: 'utf8',
  });
  process.stdout.write(check.stdout || '');
  if (check.stderr) process.stdout.write(check.stderr);

  await cleanup();
  if (check.status !== 0) {
    console.error('[FAIL] schema.sql 建出的结构与 schema.prisma 不一致');
    process.exit(1);
  }
  console.log('[OK] 便携版建库收敛：schema.sql 建出的库与 schema.prisma 完全一致');

  async function cleanup() {
    const a = new pg.Client({ connectionString: adminUrl.toString() });
    await a.connect();
    await a.query('DROP DATABASE IF EXISTS ' + DB + ' WITH (FORCE)');
    await a.end();
    console.log('[4] 临时库已删除');
  }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
