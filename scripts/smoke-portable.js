/**
 * Smoke test: boot the staged portable package with its own bundled node.exe.
 * Uses the real dev DATABASE_URL (passed via env, never printed) and a spare port
 * so it cannot collide with a running dev backend.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PORTABLE_ROOT = path.join(ROOT, 'dist/portable');
// Optional --match=<substr> so CE and EE packages can be smoke-tested separately.
const MATCH = (process.argv.find((a) => a.startsWith('--match=')) || '').slice('--match='.length);
const PKG = (() => {
  if (!fs.existsSync(PORTABLE_ROOT)) return '';
  const dirs = fs
    .readdirSync(PORTABLE_ROOT)
    .filter((n) => {
      try {
        return fs.statSync(path.join(PORTABLE_ROOT, n)).isDirectory() && (!MATCH || n.includes(MATCH));
      } catch {
        return false;
      }
    })
    .sort();
  return dirs.length ? path.join(PORTABLE_ROOT, dirs[dirs.length - 1]) : '';
})();
if (!PKG) {
  console.log('[smoke] SKIP: no staged package under dist/portable');
  process.exit(0);
}
console.log('[smoke] package:', path.basename(PKG));
const NODE = path.join(PKG, 'node', 'node.exe');

function readEnvKey(key) {
  const raw = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && m[1] === key) return m[2].replace(/^["']|["']$/g, '').trim();
  }
  return '';
}

const dbUrl = readEnvKey('DATABASE_URL');
if (!dbUrl) {
  console.log('[smoke] SKIP: no DATABASE_URL in root .env');
  process.exit(0);
}
console.log('[smoke] DATABASE_URL found (length ' + dbUrl.length + ', value hidden)');

const env = {
  ...process.env,
  NODE_ENV: 'production',
  DATABASE_URL: dbUrl,
  BACKEND_PORT: '3999',
  HTTPS_ENABLED: 'false',
  COOKIE_SECURE: 'false',
  REDIS_URL: '',
  PINE_EDITION: 'community',
  JWT_ACCESS_SECRET: 'x'.repeat(48),
  JWT_REFRESH_SECRET: 'y'.repeat(48),
};
delete env.NODE_OPTIONS;

const out = [];
const child = spawn(NODE, ['apps/backend/dist/main.js'], {
  cwd: PKG,
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.on('data', (d) => out.push(d.toString()));
child.stderr.on('data', (d) => out.push(d.toString()));

let done = false;
const finish = (why) => {
  if (done) return;
  done = true;
  const text = out.join('');
  const started = /Nest application successfully started|Successfully started|listening|Listening|3999/.test(
    text
  );
  console.log('\n[smoke] result:', why);
  console.log('[smoke] boot signals found:', started ? 'YES' : 'NO');
  console.log('[smoke] ---- last output ----');
  console.log(
    text
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .slice(-25)
      .join('\n')
  );
  try {
    child.kill('SIGKILL');
  } catch {}
  process.exit(started ? 0 : 1);
};

setTimeout(() => finish('timeout-reached'), 18000);
child.on('exit', (code) => finish('process-exited code=' + code));
