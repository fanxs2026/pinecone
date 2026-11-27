'use strict';
/**
 * e2e 一次性运行器：建临时库 → migrate deploy → 跑 key-journeys e2e → 删库。
 * （审计/QA 用，不是发布脚本）
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BE = path.join(ROOT, 'apps', 'backend');
const DB = 'pinecone_e2e';

function readEnv() {
  const file = path.join(ROOT, '.env');
  const out = {};
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
  const adminUrl = new URL(base);
  adminUrl.pathname = '/postgres';
  const tmpUrl = new URL(base);
  tmpUrl.pathname = '/' + DB;

  const { requirePg } = require('./lib/pg');
  const pg = requirePg(ROOT);

  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  console.log('[1] 重建 ' + DB);
  await admin.query('DROP DATABASE IF EXISTS ' + DB + ' WITH (FORCE)');
  await admin.query('CREATE DATABASE ' + DB);
  await admin.end();

  const cleanEnv = { ...process.env };
  delete cleanEnv.NODE_OPTIONS;

  console.log('[2] migrate deploy');
  const dep = spawnSync(
    process.execPath,
    [path.join(BE, 'node_modules', 'prisma', 'build', 'index.js'), 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'],
    { cwd: BE, env: { ...cleanEnv, DATABASE_URL: tmpUrl.toString(), DIRECT_URL: tmpUrl.toString() }, encoding: 'utf8' },
  );
  if (dep.status !== 0) {
    console.error((dep.stdout || '') + (dep.stderr || ''));
    process.exit(1);
  }
  console.log('    ok');

  console.log('[3] jest e2e');
  const jest = spawnSync(
    process.execPath,
    [path.join(BE, 'node_modules', 'jest', 'bin', 'jest.js'), '--config', 'test/jest-e2e.json', '--runInBand'],
    {
      cwd: BE,
      stdio: 'inherit',
      env: {
        ...cleanEnv,
        DATABASE_URL: tmpUrl.toString(),
        DIRECT_URL: tmpUrl.toString(),
        REGISTRATION_MODE: 'open',
        REGISTRATION_ADMIN_EMAILS: 'e2e-admin@test.local',
        JWT_ACCESS_SECRET: env.JWT_ACCESS_SECRET || 'e2e-access-secret-0123456789',
        JWT_REFRESH_SECRET: env.JWT_REFRESH_SECRET || 'e2e-refresh-secret-0123456789',
        NODE_ENV: 'test',
      },
    },
  );

  const a2 = new pg.Client({ connectionString: adminUrl.toString() });
  await a2.connect();
  await a2.query('DROP DATABASE IF EXISTS ' + DB + ' WITH (FORCE)');
  await a2.end();
  console.log('[4] 临时库已删除');

  process.exit(jest.status === 0 ? 0 : 1);
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
