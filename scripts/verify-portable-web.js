/**
 * End-to-end check for the portable package:
 *   1. no localhost URL is baked into the bundle
 *   2. frontend port can be changed via .env and takes effect at start time
 *   3. the page is reachable over a LAN IP (i.e. non-localhost)
 *   4. runtime-config.js is generated from .env
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

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
const ENV_FILE = path.join(PKG, '.env');
const NEW_PORT = 6180;

function lanIp() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family === 'IPv4' && !i.internal) return i.address;
    }
  }
  return null;
}

function withPort(port) {
  const src = fs.readFileSync(ENV_FILE, 'utf8');
  const next = src.replace(/^FRONTEND_PORT=.*$/m, 'FRONTEND_PORT=' + port);
  fs.writeFileSync(ENV_FILE + '.bak', src, 'utf8');
  fs.writeFileSync(ENV_FILE, next, 'utf8');
}

(async () => {
  console.log('[verify] package:', path.basename(PKG));

  // 1) scan the built bundle for baked localhost URLs
  let baked = 0;
  const scan = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) scan(p);
      else if (/\.(js|mjs|rsc)$/.test(name)) {
        const t = fs.readFileSync(p, 'utf8');
        const hits = t.match(/https?:\/\/localhost:3000/g);
        if (hits) baked += hits.length;
      }
    }
  };
  scan(path.join(PKG, 'apps/frontend'));
  console.log('[verify] baked localhost:3000 occurrences:', baked);

  // 2) change the port through .env only, then start
  withPort(NEW_PORT);
  console.log('[verify] .env FRONTEND_PORT ->', NEW_PORT, '(no rebuild)');

  const child = spawn(process.execPath, [path.join(PKG, 'bin', 'run-frontend.js')], {
    cwd: PKG,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));

  await new Promise((r) => setTimeout(r, 11000));

  const ip = lanIp();
  const targets = [
    ['127.0.0.1', `http://127.0.0.1:${NEW_PORT}/login`],
    ['127.0.0.1', `http://127.0.0.1:${NEW_PORT}/runtime-config.js`],
  ];
  if (ip) targets.push(['LAN ' + ip, `http://${ip}:${NEW_PORT}/login`]);

  for (const [label, url] of targets) {
    try {
      const r = await fetch(url, { redirect: 'manual' });
      const t = await r.text();
      const preview = url.endsWith('.js') ? ' | ' + t.trim().slice(0, 120) : '';
      console.log(`[verify] ${label} ${url.replace(/^https?:\/\//, '')} -> ${r.status} (${t.length}b)${preview}`);
    } catch (e) {
      console.log(`[verify] ${label} ${url} -> FAIL ${e.message}`);
    }
  }

  console.log('[verify] launcher log:');
  console.log(
    log
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .slice(0, 6)
      .map((l) => '   ' + l)
      .join('\n')
  );

  try {
    child.kill('SIGKILL');
  } catch {}
  // restore .env
  fs.writeFileSync(ENV_FILE, fs.readFileSync(ENV_FILE + '.bak', 'utf8'), 'utf8');
  fs.rmSync(ENV_FILE + '.bak', { force: true });
  console.log('[verify] .env restored');
  process.exit(0);
})();
