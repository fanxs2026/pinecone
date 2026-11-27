'use strict';
/**
 * 迁移链实测：新建临时库 → `prisma migrate deploy` 全量重放 → 与 schema.prisma 比对 → 删库。
 *
 * 为什么需要：部署有两条路——
 *   ① 便携版/Docker 之外的存量库：apply-db-patches.js（快照 + 补丁）
 *   ② Docker / CI：prisma migrate deploy
 * 两条路都必须收敛到同一份结构，否则「开发环境 / 部署环境 / 库表」不可能完全一致。
 *
 * 需要 admin 权限建库：读 .env 的 DIRECT_URL（缺省回落到 DATABASE_URL）。
 *   node scripts/verify-migrate-fresh-db.js
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DB = 'pinecone_migrate_verify';

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
  const pgEnv = { ...process.env };
  delete pgEnv.NODE_OPTIONS; // 避免 safe-delete 钩子干扰

  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  console.log('[1] 重建临时库 ' + DB + ' ...');
  await admin.query('DROP DATABASE IF EXISTS ' + DB + ' WITH (FORCE)');
  await admin.query('CREATE DATABASE ' + DB);
  await admin.end();

  console.log('[2] prisma migrate deploy ...');
  const prismaBin = path.join(ROOT, 'apps', 'backend', 'node_modules', 'prisma', 'build', 'index.js');
  const res = spawnSync(process.execPath, [prismaBin, 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'], {
    cwd: path.join(ROOT, 'apps', 'backend'),
    env: {
      ...pgEnv,
      DATABASE_URL: tmpUrl.toString(),
      DIRECT_URL: tmpUrl.toString(),
      // SHADOW_DATABASE_URL 不覆盖：deploy 不用 shadow，但 prisma.config 不允许空串
    },
    encoding: 'utf8',
  });
  const out = (res.stdout || '') + (res.stderr || '');
  const applied = (out.match(/migrations? (?:found|applied)/gi) || []).length;
  console.log('    exit=' + res.status + '  ' + out.split(/\r?\n/).filter(Boolean).slice(-2).join(' | '));
  if (res.status !== 0) {
    console.error(out);
    await cleanup();
    process.exit(1);
  }
  if (applied === 0 && /No pending migrations/i.test(out)) {
    // 空库理论上一定会应用迁移，这里只做提示
    console.log('    注意：输出显示没有待应用迁移，检查是否连错库');
  }

  console.log('[3] 结构与 schema.prisma 比对 ...');
  const check = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'verify-db-schema.js'), '--url=' + tmpUrl.toString()], {
    cwd: ROOT,
    env: pgEnv,
    encoding: 'utf8',
  });
  process.stdout.write(check.stdout || '');
  if (check.stderr) process.stdout.write(check.stderr);

  await cleanup();
  if (check.status !== 0) {
    console.error('[FAIL] 迁移链建出的结构与 schema.prisma 不一致 —— 说明有迁移缺失或写错');
    process.exit(1);
  }
  console.log('[OK] 迁移链收敛：空库 migrate deploy 后与 schema.prisma 完全一致');

  async function cleanup() {
    const a = new pg.Client({ connectionString: adminUrl.toString() });
    await a.connect();
    await a.query('DROP DATABASE IF EXISTS ' + DB + ' WITH (FORCE)');
    await a.end();
    console.log('[4] 临时库已删除');
  }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
