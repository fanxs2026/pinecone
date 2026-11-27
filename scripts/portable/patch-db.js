'use strict';
/**
 * Pinecone portable edition - apply incremental DB patches.
 *
 * 用途：给「已经部署、库里已有数据」的实例补齐新版迁移引入的结构，避免重建库丢数据。
 * 补丁文件放在 db/patches/*.sql，全部写成幂等 DDL，可重复执行。
 *
 * Usage:
 *   node bin/patch-db.js            # 执行 db/patches 下所有补丁
 *   node bin/patch-db.js --check    # 只检查缺什么，不改库
 *
 * 连接串优先取 .env 的 DATABASE_URL；缺失时可用 PINE_PATCH_DATABASE_URL 覆盖。
 */
const fs = require('fs');
const path = require('path');

const PKG = path.resolve(__dirname, '..');
const ENV_FILE = path.join(PKG, '.env');
const PATCH_DIR = path.join(PKG, 'db', 'patches');
const CHECK_ONLY = process.argv.includes('--check');

function fatal(msg) {
  console.error('[patch-db] ' + msg);
  process.exit(1);
}

function readEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^"(.*)"$/, '$1');
  }
  return out;
}

async function main() {
  const env = readEnvFile(ENV_FILE);
  const url = process.env.PINE_PATCH_DATABASE_URL || env.DATABASE_URL;
  if (!url) fatal('DATABASE_URL not found in ' + ENV_FILE + ' (run setup-db.bat first)');

  if (!fs.existsSync(PATCH_DIR)) {
    console.log('[patch-db] no db/patches directory - nothing to do.');
    return;
  }
  const files = fs
    .readdirSync(PATCH_DIR)
    .filter((f) => f.toLowerCase().endsWith('.sql'))
    .sort();
  if (files.length === 0) {
    console.log('[patch-db] no patch files - nothing to do.');
    return;
  }

  const pg = require(path.join(PKG, 'apps', 'backend', 'node_modules', 'pg'));
  const client = new pg.Client({ connectionString: url });

  console.log('');
  console.log('Pinecone - incremental DB patch');
  console.log('===============================');
  console.log('target: ' + url.replace(/:\/\/([^:]+):[^@]*@/, '://$1:***@'));
  console.log('mode  : ' + (CHECK_ONLY ? 'check only (no changes)' : 'apply'));
  console.log('');

  await client.connect();
  try {
    const missing = await detectMissing(client);
    if (missing.length === 0) {
      console.log('[patch-db] schema is up to date. Nothing to patch.');
      return;
    }
    console.log('[patch-db] missing: ' + missing.join(', '));
    if (CHECK_ONLY) {
      console.log('[patch-db] re-run without --check to apply.');
      return;
    }

    for (const file of files) {
      const sql = fs.readFileSync(path.join(PATCH_DIR, file), 'utf8');
      process.stdout.write('[patch-db] applying ' + file + ' ... ');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('COMMIT');
        console.log('ok');
      } catch (e) {
        await client.query('ROLLBACK');
        fatal(file + ' failed: ' + (e.message || e));
      }
    }

    const still = await detectMissing(client);
    if (still.length) fatal('still missing after patch: ' + still.join(', '));
    console.log('[patch-db] done. Restart the backend service now.');
  } finally {
    await client.end();
  }
}

/** 只做结构探测，避免依赖应用启动后才发现缺列 */
async function detectMissing(client) {
  const missing = [];

  // ① 2026-11-02：due_date 三列
  const cols = await client.query(
    `SELECT table_name FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'due_date'
        AND table_name IN ('stories','features','supports')`,
  );
  const haveDate = new Set(cols.rows.map((r) => r.table_name));
  for (const t of ['stories', 'features', 'supports']) {
    if (!haveDate.has(t)) missing.push(t + '.due_date');
  }

  // ② 2026-11-02：saved_views 表
  const sv = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='saved_views'`,
  );
  if (sv.rowCount === 0) missing.push('table saved_views');

  // ③ 2026-11-26：应为 uuid 却仍是 text 的列
  const uuidCols = await client.query(
    `SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema='public' AND data_type <> 'uuid' AND (
           (table_name='kb_page_links'        AND column_name IN ('id','workspaceId','pageId','entityId','createdById'))
        OR (table_name='kb_page_versions'     AND column_name IN ('id','pageId','editorId'))
        OR (table_name='dashboards'           AND column_name IN ('id','workspaceId','createdById'))
        OR (table_name='report_subscriptions' AND column_name IN ('id','workspaceId','createdById'))
      )`,
  );
  for (const r of uuidCols.rows) missing.push(r.table_name + '.' + r.column_name + ' 非 uuid');

  // ④ 2026-11-26：15 个外键
  const fkNames = [
    'votes_workspaceId_fkey', 'themes_workspaceId_fkey', 'entity_themes_workspaceId_fkey',
    'entity_themes_themeId_fkey', 'scores_workspaceId_fkey', 'entity_counters_workspaceId_fkey',
    'kb_page_links_workspaceId_fkey', 'kb_page_links_pageId_fkey', 'kb_page_links_createdById_fkey',
    'kb_page_versions_pageId_fkey', 'kb_page_versions_editorId_fkey', 'dashboards_workspaceId_fkey',
    'dashboards_createdById_fkey', 'report_subscriptions_workspaceId_fkey',
    'report_subscriptions_createdById_fkey',
  ];
  const fks = await client.query(
    `SELECT conname FROM pg_constraint WHERE contype='f' AND conname = ANY($1)`,
    [fkNames],
  );
  const haveFk = new Set(fks.rows.map((r) => r.conname));
  for (const n of fkNames) if (!haveFk.has(n)) missing.push('外键 ' + n);

  return missing;
}

main().catch((e) => fatal(e.message || String(e)));
