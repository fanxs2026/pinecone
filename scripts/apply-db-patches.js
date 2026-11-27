'use strict';
/**
 * 对指定数据库应用 scripts/portable/db/patches/*.sql（幂等，按文件名顺序）。
 *
 * 用途：让「已存在的库」（开发库 / 已部署实例）追上 schema.prisma。
 *   node scripts/apply-db-patches.js                       # 用 .env 的 DATABASE_URL
 *   node scripts/apply-db-patches.js --url=postgres://...   # 指定库
 *   node scripts/apply-db-patches.js --dry-run              # 只打印将执行的补丁
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'scripts', 'portable', 'db', 'patches');

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
  const argUrl = process.argv.find((a) => a.startsWith('--url='));
  const url = (argUrl && argUrl.slice(6)) || process.env.PINE_PATCH_DATABASE_URL || readEnv().DATABASE_URL;
  const dryRun = process.argv.includes('--dry-run');
  if (!url) { console.error('缺少数据库连接串（--url= / PINE_PATCH_DATABASE_URL / .env DATABASE_URL）'); process.exit(1); }

  const files = fs.readdirSync(DIR).filter((f) => f.toLowerCase().endsWith('.sql')).sort();
  if (!files.length) { console.log('没有补丁文件'); return; }

  console.log('目标: ' + url.replace(/:\/\/([^:]+):[^@]*@/, '://$1:***@'));
  console.log('补丁: ' + files.join(', '));
  if (dryRun) return;

  const { requirePg } = require('./lib/pg');
  const pg = requirePg(ROOT);
  const client = new pg.Client({ connectionString: url });
  client.on('notice', (n) => {
    if (n.severity !== 'INFO') console.log('    NOTICE: ' + n.message);
  });
  await client.connect();

  for (const f of files) {
    const sql = fs.readFileSync(path.join(DIR, f), 'utf8');
    process.stdout.write('[apply] ' + f + ' ... ');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('COMMIT');
      console.log('ok');
    } catch (e) {
      await client.query('ROLLBACK');
      console.log('FAILED');
      console.error(e.message);
      await client.end();
      process.exit(1);
    }
  }
  await client.end();
  console.log('全部补丁执行完毕。');

  // 复查：补丁里的 DO 块可能因「表不存在 / 数据脏」静默跳过，
  // 打印一句 ok 不代表结构真的追平了。这里强制跑一次结构比对。
  if (process.argv.includes('--no-verify')) {
    console.log('已跳过结构复查（--no-verify）');
    return;
  }
  console.log('');
  console.log('复查：与 prisma/schema.prisma 比对 ...');
  const { spawnSync } = require('child_process');
  const env2 = { ...process.env };
  delete env2.NODE_OPTIONS;
  const check = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'verify-db-schema.js'), '--url=' + url], {
    cwd: ROOT,
    env: env2,
    encoding: 'utf8',
  });
  process.stdout.write(check.stdout || '');
  if (check.stderr) process.stdout.write(check.stderr);
  if (check.status !== 0) {
    console.error('[FAIL] 结构仍未追平，见上面的差异清单');
    process.exit(1);
  }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
