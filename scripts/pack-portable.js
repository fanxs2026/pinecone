#!/usr/bin/env node
/**
 * Pinecone portable (zero-install) package builder.
 *
 * Produces one zip that a customer can unzip and double-click on a Windows box
 * with NO Docker, NO Node, NO Redis installed.
 *
 * Layout contract (DO NOT change casually):
 *   <pkg>/apps/backend/dist/main.js   <- main.ts loadEnv(resolve(__dirname,'../../../.env'))
 *                                        resolves exactly to <pkg>/.env at this depth
 *   <pkg>/apps/frontend/server.js     <- Next standalone keep its monorepo nesting
 *   <pkg>/uploads                     <- main.ts useStaticAssets(join(process.cwd(),'uploads'))
 *
 * Design: copy-with-filter, NEVER delete. The host sandbox aborts a process that
 * performs too many unlink/rmdir calls in one run, so pruning happens by
 * skipping files during copy instead of copying then removing.
 *
 * Usage:
 *   node scripts/pack-portable.js [--skip-deps] [--skip-zip] [--api-url=http://localhost:3000/api]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const CACHE = path.join(DIST, '.pack-cache');
const DEPS = path.join(CACHE, 'backend-deps');
const STAGE_ROOT = path.join(DIST, 'portable');

const argv = process.argv.slice(2);
const hasFlag = (f) => argv.includes(f);
const getArg = (k, d) => {
  const hit = argv.find((a) => a.startsWith('--' + k + '='));
  return hit ? hit.slice(k.length + 3) : d;
};

const SKIP_DEPS = hasFlag('--skip-deps');
const SKIP_ZIP = hasFlag('--skip-zip');
const BUILD_FRONTEND = hasFlag('--build-frontend');
// Reuse apps/backend/.ee-build/dist when it already contains a fixed build.
// Saves a full recompile; only safe when backend sources are unchanged since.
const REUSE_EE_BUILD = hasFlag('--reuse-ee-build');
const API_URL = getArg('api-url', 'http://localhost:3000/api');
// NOTE: licences are deliberately NOT baked into release packages. A licence is
// per-customer material and is delivered separately by scripts/license-issue.js
// (dist/licenses/<id>.env). The package always ships an empty PINE_LICENSE_KEY.
const VERSION = getArg('version', require(path.join(ROOT, 'package.json')).version || '0.0.0');
// Platform suffix is derived from the actual build host, never hardcoded: the
// package carries the host's node.exe, so the name must state what it really is.
const PLATFORM = process.platform === 'win32' ? 'win' : process.platform;
const ARCH = process.arch;

// Edition: ce (default) | ee. EE pulls modules from the private overlay repo at
// build time only; nothing from the overlay is ever written into the public tree.
const EDITION = (getArg('edition', 'ce') || 'ce').toLowerCase();
if (EDITION !== 'ce' && EDITION !== 'ee') fail('unknown --edition: ' + EDITION);
const OVERLAY = getArg('overlay', path.join(ROOT, '..', 'pinecone-overlay'));
const PKG_NAME =
  'pinecone-' + EDITION + '-portable-' + VERSION + '-' + PLATFORM + '-' + ARCH;
// Build copy lives INSIDE apps/backend so tsc resolves the real node_modules by
// ordinary parent-directory walking. A junction does not survive Node/tsc module
// resolution on this pnpm layout (verified: realpath works, require.resolve fails).
const BUILD_DIR = path.join(ROOT, 'apps/backend/.ee-build');
// --stamp: 打包到带时间戳的新目录，从而完全不必删除上一次的 stage。
// 某些环境里递归删除大目录会被安全钩子拦截，这个开关是它的替代路径。
// zip 产物名仍是不带时间戳的 PKG_NAME.zip，不受影响。
const STAGE_STAMP = hasFlag('--stamp')
  ? '.' + new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
  : '';
// --stage=<dir>：直接指定要操作的 stage 目录（配合 --check-deps 校验历史产物）
const STAGE_OVERRIDE = getArg('stage', '');
const STAGE = STAGE_OVERRIDE
  ? path.resolve(ROOT, STAGE_OVERRIDE)
  : path.join(STAGE_ROOT, PKG_NAME + STAGE_STAMP);

const MB = (n) => (n / 1048576).toFixed(1) + ' MB';
const log = (...a) => console.log('[pack]', ...a);

function fail(msg) {
  console.error('[pack] FATAL: ' + msg);
  process.exit(1);
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function sizeOf(p) {
  let total = 0;
  const stack = [p];
  while (stack.length) {
    const cur = stack.pop();
    let st;
    try {
      st = fs.lstatSync(cur);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      for (const n of fs.readdirSync(cur)) stack.push(path.join(cur, n));
    } else if (st.isFile()) total += st.size;
  }
  return total;
}

// ---------------------------------------------------------------- prune rules

const DROP_FILE_RE = [
  /\.d\.(ts|mts|cts)$/i, // TS declarations: never read at runtime
  /\.map$/i, // sourcemaps
  /^(readme|changelog|history|contributing|code_of_conduct)(\.[a-z]+)?$/i,
  /\.(md|markdown)$/i, // docs (LICENSE/NOTICE kept below)
];
const KEEP_FILE_RE = [/^(license|licence|notice|copying)/i];

// Directory pruning is deliberately minimal: packages use runtime code dirs with
// innocent names (exceljs keeps its workbook builder in lib/doc/). Dropping 'doc'
// or 'test' by name silently breaks them, so only unambiguous tool dirs go.
const DROP_DIR_NAMES = new Set(['.github', '.bin']);

/** Packages that are installed but provably unused at runtime. */
const DROP_PKG_DIRS = new Set([
  // keep this empty unless a package is verified dead: class-validator eagerly
  // requires libphonenumber-js at module load, so it must stay.
]);

/** Prisma ships WASM query compilers for 5 databases x 2 sizes x 2 module formats. */
function prismaRuntimeFilter(relPosix) {
  // relPosix is relative to node_modules, e.g. "@prisma/client/runtime/x.js"
  const inRuntime = relPosix.startsWith('@prisma/client/runtime/');
  if (!inRuntime) return true;
  const base = path.posix.basename(relPosix);
  if (!base.startsWith('query_compiler_')) return true;
  // The generated client hard-requires:
  //   query_compiler_fast_bg.postgresql.js
  //   query_compiler_fast_bg.postgresql.wasm-base64.js
  // Keep every postgresql CJS variant (fast + small) and drop the rest.
  if (!base.includes('.postgresql.')) return false;
  if (base.endsWith('.mjs')) return false; // app is CJS-only
  return true;
}

function keepRel(relPosix) {
  const parts = relPosix.split('/');
  const base = parts[parts.length - 1];

  if (parts.some((p) => DROP_DIR_NAMES.has(p))) return false;
  if (DROP_FILE_RE.some((re) => re.test(base)) && !KEEP_FILE_RE.some((re) => re.test(base))) {
    return false;
  }
  if (relPosix.startsWith('@prisma/client/runtime/')) return prismaRuntimeFilter(relPosix);
  if (relPosix.startsWith('@prisma/client/generator-build/')) return false; // CLI-time only
  if (relPosix.startsWith('@prisma/client/scripts/')) return false; // CLI-time only
  if (relPosix === '.package-lock.json') return false;
  return true;
}

function shouldDropPackage(relPosix) {
  const first = relPosix.split('/')[0];
  if (first.startsWith('@')) {
    const second = relPosix.split('/')[1];
    return DROP_PKG_DIRS.has(first + '/' + second);
  }
  return DROP_PKG_DIRS.has(first);
}

// ------------------------------------------------------------- copy utilities

let copied = 0;
let skipped = 0;
let brokenLinks = 0;

/**
 * pnpm keeps peer dependencies as symlinks; Next's output tracer drops targets it
 * decided are unnecessary, leaving dangling links (react/react-dom/sharp/styled-jsx).
 * Those are never dereferenced at runtime, so skip instead of aborting.
 */
function tryRealpath(p) {
  try {
    const real = fs.realpathSync(p);
    fs.statSync(real);
    return real;
  } catch {
    brokenLinks++;
    return null;
  }
}

function copyFiltered(srcDir, dstDir, filter) {
  ensureDir(dstDir);
  for (const name of fs.readdirSync(srcDir)) {
    const src = path.join(srcDir, name);
    const dst = path.join(dstDir, name);
    const st = fs.lstatSync(src);
    if (st.isSymbolicLink()) {
      // npm trees are real dirs; pnpm trees are symlinks we must not follow blindly
      const real = tryRealpath(src);
      if (!real) continue;
      const rst = fs.statSync(real);
      if (rst.isDirectory()) copyFiltered(real, dst, filter);
      else {
        ensureDir(path.dirname(dst));
        fs.copyFileSync(real, dst);
        copied++;
      }
      continue;
    }
    if (st.isDirectory()) {
      copyFiltered(src, dst, filter);
    } else {
      if (filter && !filter(dst)) {
        skipped++;
        continue;
      }
      ensureDir(path.dirname(dst));
      fs.copyFileSync(src, dst);
      copied++;
    }
  }
}

function copyTreeWithFilter(srcRoot, dstRoot, keepFn) {
  const walk = (rel) => {
    const srcDir = path.join(srcRoot, rel);
    for (const name of fs.readdirSync(srcDir)) {
      const relChild = rel ? rel + '/' + name : name;
      const src = path.join(srcRoot, relChild);
      const dst = path.join(dstRoot, relChild);
      const st = fs.lstatSync(src);
      if (st.isSymbolicLink()) {
        const real = tryRealpath(src);
        if (!real) continue;
        if (fs.statSync(real).isDirectory()) {
          walk(relChild);
        } else {
          ensureDir(path.dirname(dst));
          fs.copyFileSync(real, dst);
          copied++;
        }
        continue;
      }
      if (st.isDirectory()) {
        walk(relChild);
      } else {
        if (!keepFn(relChild)) {
          skipped++;
          continue;
        }
        ensureDir(path.dirname(dst));
        fs.copyFileSync(src, dst);
        copied++;
      }
    }
  };
  walk('');
}

// ------------------------------------------------- enterprise (EE) build

/**
 * Authoritative module list, read from ee-gate.ts so the packer can never drift
 * from what the runtime will actually import.
 */
function readGateModules() {
  const file = path.join(ROOT, 'apps/backend/src/ee-gate.ts');
  if (!fs.existsSync(file)) fail('ee-gate.ts not found: ' + file);
  const names = new Set();
  for (const m of fs.readFileSync(file, 'utf8').matchAll(/'@ee\/([a-z0-9-]+)\//g)) {
    names.add(m[1]);
  }
  return [...names];
}

/** Fail closed: never ship a CE package that contains enterprise modules. */
function ceDistGuard(distDir) {
  const gate = readGateModules();
  const modDir = path.join(distDir, 'modules');
  if (!fs.existsSync(modDir)) return;
  const leaked = fs.readdirSync(modDir).filter((n) => gate.includes(n));
  if (leaked.length) {
    fail(
      'refusing to package CE: ' +
        leaked.join(', ') +
        ' found in ' +
        path.relative(ROOT, modDir) +
        ' (stale enterprise build). Rebuild the backend first.'
    );
  }
}

/**
 * Compile an enterprise backend inside dist/.ee-build, leaving the public tree
 * untouched. Mirrors docker/ backend overlay: every overlay module overwrites a
 * same-named CE module (`automation` is one of those), so the copy is essential.
 */
function buildEnterpriseDist() {
  const overlayModulesDir = path.join(OVERLAY, 'backend', 'modules', 'ee');
  if (!fs.existsSync(overlayModulesDir)) {
    fail(
      'enterprise overlay not found: ' +
        overlayModulesDir +
        '\n  pass --overlay=<path> to point at the private overlay repository.'
    );
  }
  const overlayModules = fs
    .readdirSync(overlayModulesDir)
    .filter((n) => fs.statSync(path.join(overlayModulesDir, n)).isDirectory());
  const gate = readGateModules();

  const missing = gate.filter((n) => !overlayModules.includes(n));
  const extra = overlayModules.filter((n) => !gate.includes(n));
  log('overlay modules:', overlayModules.length, '| ee-gate modules:', gate.length);
  if (missing.length) {
    fail('overlay is missing modules required by ee-gate: ' + missing.join(', '));
  }
  if (extra.length) {
    log('note: overlay also replaces CE modules (not gated):', extra.join(', '));
  }

  const existingDist = path.join(BUILD_DIR, 'dist');
  if (REUSE_EE_BUILD && fs.existsSync(path.join(existingDist, 'main.js'))) {
    log('reusing existing enterprise build ->', path.relative(ROOT, existingDist));
    return existingDist;
  }

  if (fs.existsSync(BUILD_DIR)) fs.rmSync(BUILD_DIR, { recursive: true, force: true });
  const beDst = BUILD_DIR;
  ensureDir(beDst);

  log('copying backend sources into build dir ...');
  for (const item of [
    'src',
    'nest-cli.json',
    'tsconfig.json',
    'tsconfig.build.json',
    'package.json',
    'prisma.config.ts',
  ]) {
    const from = path.join(ROOT, 'apps/backend', item);
    if (!fs.existsSync(from)) continue;
    const to = path.join(beDst, item);
    if (fs.statSync(from).isDirectory()) copyFiltered(from, to, null);
    else fs.copyFileSync(from, to);
  }

  // No node_modules copy or junction: .ee-build sits under apps/backend, so tsc
  // finds apps/backend/node_modules by walking up. Keeps the build cheap.

  for (const m of overlayModules) {
    const to = path.join(beDst, 'src', 'modules', m);
    if (fs.existsSync(to)) fs.rmSync(to, { recursive: true, force: true });
    copyFiltered(path.join(overlayModulesDir, m), to, null);
  }
  log('injected', overlayModules.length, 'enterprise modules (build copy only)');

  const nestBin = path.join(ROOT, 'apps/backend/node_modules', '@nestjs/cli/bin/nest.js');
  if (!fs.existsSync(nestBin)) fail('nest CLI not found: ' + nestBin);
  log('compiling enterprise backend ...');
  execFileSync(process.execPath, [nestBin, 'build'], {
    cwd: beDst,
    stdio: 'inherit',
    env: { ...process.env, NODE_OPTIONS: '', PINE_EDITION: 'enterprise' },
  });

  const distDir = path.join(beDst, 'dist');
  if (!fs.existsSync(path.join(distDir, 'main.js'))) {
    fail('enterprise build produced no dist/main.js');
  }
  log('enterprise build ok ->', path.relative(ROOT, distDir));
  return distDir;
}

// --------------------------------------------------- 1. inputs

/**
 * Rebuild the frontend with NEXT_PUBLIC_* explicitly emptied.
 *
 * Those vars are build-time text substitutions. Leaving the dev values in place
 * would bake https://localhost:3000 into the bundle and defeat runtime
 * resolution. Empty value => lib/runtime-config.ts derives the address from
 * window.location at runtime, so one artifact serves any host and port.
 */
function buildFrontend() {
  if (!BUILD_FRONTEND) {
    log('frontend build: skipped (pass --build-frontend to rebuild with runtime URLs)');
    return;
  }
  // 与 scripts/verify.bat 共用同一份构建实现，避免「两处构建、两种产物」。
  // 该脚本负责：Node 层把 NEXT_PUBLIC_* 置为空字符串（压住 .env.local）、
  // 构建后自检产物里没有硬编码 localhost。
  log('frontend build: rebuilding with empty NEXT_PUBLIC_* ...');
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-frontend-pack.js')], {
    stdio: 'inherit',
    env: { ...process.env, NODE_OPTIONS: '' },
  });
  log('frontend build: done');
}

/** 递归取目录下最新 mtime（跳过构建产物与依赖目录） */
function newestMtime(dir, extraIgnore) {
  const skip = new Set(['node_modules', '.next', 'dist', '.turbo', '.ee-build', ...(extraIgnore || [])]);
  let newest = 0;
  const walk = (d) => {
    let ents;
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (skip.has(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) {
        try {
          const t = fs.statSync(p).mtimeMs;
          if (t > newest) newest = t;
        } catch { /* ignore */ }
      }
    }
  };
  walk(dir);
  return newest;
}

/**
 * 产物新鲜度门禁。
 *
 * 2026-11-26 事故：源码已修、dist 却是旧的，包打出来装上去仍然报错。
 * 「代码改对了」不等于「交付物是新代码」，这里用 mtime 把两者钉死：
 *   · prisma/schema.prisma 改过但没 generate  → 拦
 *   · apps/backend/src 改过但没 nest build     → 拦
 *   · apps/frontend/src 改过但没 next build    → 拦
 * 需要刻意打过期包时用 --allow-stale。
 */
function assertFresh(distDir) {
  if (hasFlag('--allow-stale')) {
    log('freshness check: SKIPPED (--allow-stale)');
    return;
  }

  const schemaMtime = fs.statSync(path.join(ROOT, 'apps/backend/prisma/schema.prisma')).mtimeMs;
  const generatedMtime = newestMtime(path.join(ROOT, 'apps/backend/src/generated'));
  if (generatedMtime < schemaMtime) {
    fail(
      'Prisma client is stale: src/generated is older than prisma/schema.prisma.\n' +
        '  Run: pnpm --filter backend exec prisma generate',
    );
  }

  const beSrcMtime = newestMtime(path.join(ROOT, 'apps/backend/src'), ['generated']);
  const mainJs = path.join(distDir, 'main.js');
  const mainMtime = fs.statSync(mainJs).mtimeMs;
  if (mainMtime < beSrcMtime) {
    fail(
      'Backend build is stale: ' + path.relative(ROOT, mainJs) + ' is older than apps/backend/src.\n' +
        '  Run: pnpm --filter backend build  (EE: rebuild the enterprise dist, do NOT pass --reuse-ee-build)',
    );
  }

  // EE：企业模块来自私有 overlay，不在 apps/backend/src 下，必须单独比对，
  // 否则 --reuse-ee-build 会把旧的企业代码打进包（本次事故的同一类问题）。
  if (EDITION === 'ee') {
    const overlayBe = path.join(OVERLAY, 'backend');
    if (fs.existsSync(overlayBe)) {
      const overlayMtime = newestMtime(overlayBe);
      if (mainMtime < overlayMtime) {
        fail(
          'EE overlay is stale vs build: ' + path.relative(ROOT, mainJs) + ' is older than ' + overlayBe + '.\n' +
            '  Rebuild the enterprise dist (do NOT pass --reuse-ee-build).',
        );
      }
    }
  }

  const feSrcMtime = newestMtime(path.join(ROOT, 'apps/frontend/src'));
  const feBuildFile = [
    'apps/frontend/.next/BUILD_ID',
    'apps/frontend/.next/standalone/apps/frontend/server.js',
  ]
    .map((r) => path.join(ROOT, r))
    .find((p) => fs.existsSync(p));
  if (!feBuildFile) fail('Frontend build output missing. Run: node scripts/pack-portable.js --build-frontend');
  if (fs.statSync(feBuildFile).mtimeMs < feSrcMtime) {
    fail(
      'Frontend build is stale: ' + path.relative(ROOT, feBuildFile) + ' is older than apps/frontend/src.\n' +
        '  Re-run the packer with --build-frontend',
    );
  }

  log('freshness check: ok (backend dist + frontend .next are newer than sources)');
}

function checkInputs(distDir) {
  // The bundle ships the build host's node.exe, so a cross-platform package
  // cannot be produced here. Fail loudly instead of emitting a mislabelled zip.
  if (process.platform !== 'win32') {
    fail('this packer only builds Windows packages (host is ' + process.platform + ')');
  }
  if (process.arch !== 'x64' && process.arch !== 'arm64') {
    fail('unsupported host architecture: ' + process.arch);
  }
  if (!fs.existsSync(path.join(distDir || '', 'main.js'))) {
    fail('backend build output missing: ' + distDir + '/main.js (run nest build first)');
  }
  for (const rel of [
    'apps/frontend/.next/standalone/apps/frontend/server.js',
    'apps/frontend/.next/static',
  ]) {
    if (!fs.existsSync(path.join(ROOT, rel))) {
      fail('missing build artifact: ' + rel + ' (run the frontend build first)');
    }
  }
  assertFresh(distDir);

  // 结构门禁：db/schema.sql 必须覆盖 prisma/schema.prisma，否则装出来的库缺列/缺表
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'verify-portable-schema.js')], {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env, NODE_OPTIONS: '' },
    });
  } catch {
    fail('portable schema check failed — db/schema.sql is out of sync with prisma/schema.prisma');
  }
}

// --------------------------------------------------- 2. backend production deps

function preparedDeps() {
  const pkgPath = path.join(DEPS, 'package.json');
  const be = require(path.join(ROOT, 'apps/backend/package.json'));
  const pinned = {};
  const unresolved = [];
  for (const name of Object.keys(be.dependencies || {})) {
    const p = path.join(ROOT, 'apps/backend/node_modules', name, 'package.json');
    if (fs.existsSync(p)) pinned[name] = JSON.parse(fs.readFileSync(p, 'utf8')).version;
    else unresolved.push(name);
  }
  if (unresolved.length) fail('cannot resolve exact versions for: ' + unresolved.join(', '));

  ensureDir(DEPS);
  fs.writeFileSync(
    pkgPath,
    JSON.stringify(
      { name: 'pinecone-backend-portable', version: be.version, private: true, dependencies: pinned },
      null,
      2
    )
  );
  return Object.keys(pinned).length;
}

function installDeps() {
  if (SKIP_DEPS && fs.existsSync(path.join(DEPS, 'node_modules'))) {
    log('deps: reusing cache at', path.relative(ROOT, DEPS));
    return;
  }
  const count = preparedDeps();
  log('deps: installing', count, 'pinned production dependencies ...');
  execFileSync(
    process.execPath,
    [
      path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
      'install',
      '--omit=dev',
      '--registry=https://registry.npmmirror.com',
      '--no-audit',
      '--no-fund',
      '--loglevel=error',
    ],
    { cwd: DEPS, stdio: 'inherit', env: { ...process.env, NODE_OPTIONS: '' } }
  );
}

// --------------------------------------------------------------- 3. assemble

function writeEnv() {
  const rnd = (n) => crypto.randomBytes(n).toString('hex');
  const body = [
    '# Pinecone portable edition - generated by scripts/pack-portable.js',
    '# Edit DATABASE_URL (and passwords) before the first start.',
    'PINE_EDITION=' + (EDITION === 'ee' ? 'enterprise' : 'community'),
    '',
    '# --- database (PostgreSQL 15+) ---',
    'DATABASE_URL=postgresql://pinecone_app:CHANGE_ME@127.0.0.1:5432/pinecone?schema=public',
    'DB_PASSWORD=CHANGE_ME',
    'APP_DB_PASSWORD=CHANGE_ME',
    '',
    '# --- secrets (auto-generated, keep private) ---',
    'JWT_ACCESS_SECRET=' + rnd(32),
    'JWT_REFRESH_SECRET=' + rnd(32),
    'FIELD_ENCRYPTION_SECRET=' + rnd(32),
    '',
    '# --- enterprise licence (REQUIRED for enterprise features) ---',
    '# EE features need a signed licence. Empty / invalid / expired / wrong format',
    '# falls back to community: the service keeps running, EE endpoints return 403.',
    '# Issue one: node scripts/license-sign.js --customer "ACME Ltd" --days 365 --seats 20',
    'PINE_LICENSE_KEY=',
    '',
    '# --- network ---',
    'BACKEND_PORT=3000',
    'FRONTEND_PORT=6173',
    'KB_COLLAB_PORT=3002',
    'FRONTEND_URL=http://localhost:6173',
    'API_URL=' + API_URL,
    'WS_URL=' + API_URL.replace(/\/api$/, '') + '/ws',
    'HTTPS_ENABLED=false',
    'COOKIE_SECURE=false',
    'TRUST_PROXY=false',
    '',
    '# Allow browser calls from the same host on other ports (LAN IP access).',
    '# Docker/hosted deployments keep the strict FRONTEND_URL allowlist (omit this).',
    'CORS_ALLOW_SAME_HOST=true',
    '',
    '# Frontend talks to the backend at <page host>:BACKEND_PORT automatically.',
    '# Only set these if the API lives behind a reverse proxy on another path/host.',
    '# RUNTIME_API_URL=http://192.168.1.50:3000/api',
    '# RUNTIME_WS_URL=ws://192.168.1.50:3000/ws',
    '',
    '# --- redis is OPTIONAL: leave blank to use in-memory fallback (single instance) ---',
    'REDIS_URL=',
    '',
    '# --- storage ---',
    'KB_COLLAB_PERSIST_DIR=./data/kb-collab',
    '',
    '# --- registration: open | whitelist | invite (there is NO "closed") ---',
    '# Portable default is open so a fresh deployment can register the first user.',
    '# whitelist + empty whitelist table = effectively nobody can register.',
    'REGISTRATION_MODE=open',
    '',
    '# The first account registered on a fresh database becomes platform admin.',
    '# Guarded: grants only when the users table has exactly one row, so a second',
    '# registration never inherits admin. Set to false to require the email list below.',
    'FIRST_USER_BECOMES_ADMIN=true',
    '',
    '# --- smtp (optional, can also be set in the admin UI) ---',
    'EMAIL_HOST=',
    'EMAIL_PORT=587',
    'EMAIL_USER=',
    'EMAIL_PASS=',
    'EMAIL_FROM=',
    '',
    '# --- platform admin: comma separated emails ---',
    '# Replace with the real administrator email BEFORE registering that account,',
    '# then restart. Accounts whose email is listed here get the admin console',
    '# (registration whitelist / invite codes / SMTP / licence management).',
    'REGISTRATION_ADMIN_EMAILS=change me to your email',
    '',
  ].join('\r\n');
  fs.writeFileSync(path.join(STAGE, '.env'), body, 'utf8');
  fs.writeFileSync(path.join(STAGE, '.env.example'), body, 'utf8');
}

const START_BAT = [
  '@echo off',
  'setlocal',
  'cd /d "%~dp0"',
  'title Pinecone',
  '',
  'if not exist "node\\node.exe" (',
  '  echo ERROR: node\\node.exe is missing. The package is incomplete.',
  '  pause',
  '  exit /b 1',
  ')',
  '',
  'if not exist ".env" (',
  '  copy /y ".env.example" ".env" >nul',
  '  echo Generated .env - edit DATABASE_URL first, then run start.bat again.',
  '  notepad ".env"',
  '  pause',
  '  exit /b 1',
  ')',
  '',
  'findstr /C:"CHANGE_ME" ".env" >nul 2>&1',
  'if not errorlevel 1 (',
  '  echo.',
  '  echo .env still contains CHANGE_ME placeholders.',
  '  echo Edit DATABASE_URL and the two passwords, save, then run start.bat again.',
  '  notepad ".env"',
  '  pause',
  '  exit /b 1',
  ')',
  '',
  'if not exist "uploads" mkdir "uploads"',
  'if not exist "logs" mkdir "logs"',
  'if not exist "data\\kb-collab" mkdir "data\\kb-collab"',
  '',
  'if not exist ".db-ready" (',
  '  echo.',
  '  echo NOTE: the database was not initialised by setup-db.bat on this machine.',
  '  echo       On a FIRST run, close this window and run setup-db.bat first.',
  '  echo       Otherwise the backend will log "table does not exist" errors.',
  '  echo.',
  '  timeout /t 8 /nobreak >nul',
  ')',
  '',
  'echo [1/4] Starting backend on http://localhost:3000 ...',
  'start "pinecone-backend" /min /d "%~dp0" cmd /c "bin\\run-backend.cmd"',
  '',
  'echo [2/4] Waiting for backend ...',
  'timeout /t 10 /nobreak >nul',
  '',
  'rem --- first-deploy admin hint: backend logs FIRST-RUN-ADMIN-PENDING when the',
  'rem     users table is empty and FIRST_USER_BECOMES_ADMIN=true. The backend',
  'rem     window is minimized, so repeat it here where the operator can see it.',
  'set FEPORT=6173',
  'for /f "tokens=2 delims==" %%i in (\'findstr /b /c:"FRONTEND_PORT=" ".env"\') do set FEPORT=%%i',
  'findstr /C:"FIRST-RUN-ADMIN-PENDING" "logs\\backend.log" >nul 2>&1',
  'if not errorlevel 1 (',
  '  echo.',
  '  echo ============================================================',
  '  echo   FIRST DEPLOY - NO USER ACCOUNT YET',
  '  echo   The FIRST account you register becomes the platform admin.',
  '  echo   Register now: http://localhost:%FEPORT%',
  '  echo   Afterwards set FIRST_USER_BECOMES_ADMIN=false in .env',
  '  echo ============================================================',
  '  echo.',
  '  timeout /t 10 /nobreak >nul',
  ')',
  '',
  'echo [3/4] Starting frontend on http://localhost:6173 ...',
  'start "pinecone-frontend" /min /d "%~dp0" cmd /c "node\\node.exe bin\\run-frontend.js > logs\\frontend.log 2>&1"',
  '',
  'echo [4/4] Opening browser ...',
  'timeout /t 6 /nobreak >nul',
  'start "" "http://localhost:6173"',
  '',
  'echo.',
  'echo Pinecone is running. Logs: logs\\backend.log  logs\\frontend.log',
  'echo Close the two minimized windows (or run stop.bat) to shut down.',
  'echo.',
  'pause',
].join('\r\n');

const RUN_BACKEND = [
  '@echo off',
  'cd /d "%~dp0.."',
  'set NODE_ENV=production',
  'rem enterprise builds need node_modules/@ee -> dist/modules (no-op for CE)',
  '"node\\node.exe" "bin\\link-ee.js" 2>nul',
  '"node\\node.exe" "apps\\backend\\dist\\main.js" > "logs\\backend.log" 2>&1',
].join('\r\n');

// Frontend launcher lives in scripts/portable/run-frontend.js (copied verbatim):
// keeping it as a real file avoids escaping traps and lets it be edited/tested.

const STOP_BAT = [
  '@echo off',
  'setlocal',
  'cd /d "%~dp0"',
  'echo Stopping Pinecone ...',
  'powershell -NoProfile -ExecutionPolicy Bypass -Command ^',
  '  "Get-CimInstance Win32_Process -Filter \\"Name=\'node.exe\'\\" | Where-Object { $_.CommandLine -like \'*apps\\*dist\\main.js*\' -or $_.CommandLine -like \'*apps\\*server.js*\' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"',
  'echo Done.',
  'timeout /t 2 /nobreak >nul',
].join('\r\n');

/**
 * README 用生成函数而不是静态数组：EE 比 CE 多一步「填 licence」，
 * 步骤编号必须连续，不能出现 Step 1 / 3 / 4 这种跳号。
 */
function buildReadme() {
  const steps = [];
  let n = 0;
  const step = (title, lines) => {
    n += 1;
    steps.push('Step ' + n + ' - ' + title);
    for (const line of lines) steps.push('  ' + line);
    steps.push('');
  };

  step('Prepare the database (once per machine)', [
    '1. Install PostgreSQL 15+ and remember the superuser (postgres) password.',
    '2. Double-click setup-db.bat.',
    '   It creates the roles, the database and all tables, then writes',
    '   DATABASE_URL (and the passwords) into .env automatically.',
    '   Give it the superuser name/password when asked.',
  ]);

  if (EDITION === 'ee') {
    step('Activate the enterprise licence', [
      'The package does NOT ship a licence. You receive it separately as a file',
      'or as one line: PINE_LICENSE_KEY=PINECONE-EE....',
      '',
      '1. Open .env, find the line PINE_LICENSE_KEY= and paste the value after',
      '   the equals sign (one single line, no line breaks).',
      '2. Save. The licence is read at startup.',
      '',
      'Without a valid licence the server still starts, but runs as Community:',
      'enterprise endpoints return 403.',
      'Check logs\\backend.log for one of these lines:',
      '  [Edition] declared=enterprise effective=enterprise   <- licensed',
      '  [Edition] declared=enterprise effective=community    <- not licensed',
      'The second line names the reason (missing / expired / bad signature).',
    ]);
  }

  step('Start', [
    'Double-click start.bat. The browser opens http://localhost:6173',
    'Two minimized windows hold the backend and frontend; logs\\ has their output.',
  ]);

  step('Create the administrator (FIRST RUN ONLY)', [
    'IMPORTANT: the FIRST account you register becomes the platform',
    'administrator. start.bat prints a reminder when no account exists yet.',
    '',
    '1. On the login page choose "Register" and sign up.',
    '2. That account now owns the admin console: registration whitelist,',
    '   invite codes, SMTP settings and (enterprise) licence management.',
    '3. Then open .env and set',
    '        FIRST_USER_BECOMES_ADMIN=false',
    '   and restart, so later registrations never inherit admin rights.',
    '',
    'Adding more administrators: list their emails in ONE line, comma',
    'separated, in REGISTRATION_ADMIN_EMAILS (multi-line does NOT work).',
  ]);

  step('Lock down registration (recommended for production)', [
    'Registration is open by default (REGISTRATION_MODE=open in .env).',
    'Change it to one of:',
    '  whitelist   only emails added to the whitelist table can register',
    '  invite      an invite code (max uses / expiry) is required',
    'There is no "closed" value: whitelist with an empty table means nobody',
    'can register. Restart the backend after editing .env.',
  ]);

  return [
    'Pinecone - ' +
      (EDITION === 'ee' ? 'Enterprise' : 'Community') +
      ' Portable Edition ' +
      VERSION +
      ' (' +
      PLATFORM +
      '-' +
      ARCH +
      ')',
    '======================================================================',
    '',
    'No installation required. Node.js is bundled. Redis is not needed.',
    '',
    'Requirements',
    '  - Windows 10/11 x64',
    '  - PostgreSQL 15 or newer, reachable from this machine',
    EDITION === 'ee'
      ? '  - An enterprise licence key issued for your organisation'
      : '  - Nothing else',
    '',
    ...steps,
    'Prefer to prepare the database yourself',
    '  - create role pinecone_app (owner) and a database owned by it',
    '  - apply db\\schema.sql as that role',
    '  - fill DATABASE_URL / DB_PASSWORD / APP_DB_PASSWORD in .env manually',
    '',
    'Daily use',
    '  start.bat   start everything',
    '  stop.bat    stop everything',
    '',
    'Troubleshooting',
    '  logs\\backend.log    backend output (DB and licence messages appear here)',
    '  logs\\frontend.log   frontend output',
    '',
    'Ports and access',
    '  3000  backend API   (/api, /api/docs)',
    '  6173  web UI',
    '  Both are configurable in .env: BACKEND_PORT / FRONTEND_PORT.',
    '  Other machines on the LAN use http://<this-machine-ip>:6173',
    '',
    'Notes',
    '  - Uploaded files live in uploads\\',
    '  - Knowledge-base collaboration data lives in data\\kb-collab\\',
    '  - .env is the only place to change settings; restart after editing',
    '  - To upgrade: stop, replace the program files, keep .env uploads\\ and data\\',
    '',
  ].join('\r\n');
}

const EE_README_EXTRA = [
  'Enterprise notes',
  '  - Licence details are in Step 2 above.',
  '  - Enterprise modules live in apps/backend/node_modules/@ee',
  '  - This package is licensed under a separate commercial EULA (EULA.txt).',
  '    It must not be redistributed or published on any public repository.',
  '',
].join('\r\n');

/**
 * 中文版说明（README_zh_cn.txt）。
 *
 * 结构与英文版一一对应、步骤编号同样动态（EE 多一步许可），便于两版对照。
 * 文件以 UTF-8 + BOM 写入：Win10 以前的记事本只有见到 BOM 才不乱码。
 */
function buildReadmeZh() {
  const steps = [];
  let n = 0;
  const step = (title, lines) => {
    n += 1;
    steps.push('第 ' + n + ' 步 - ' + title);
    for (const line of lines) steps.push('  ' + line);
    steps.push('');
  };

  step('准备数据库（每台机器只需一次）', [
    '1. 安装 PostgreSQL 15 或更高版本，记住超级用户（postgres）的密码。',
    '2. 双击 setup-db.bat。',
    '   它会创建角色、数据库和全部数据表，并自动把 DATABASE_URL',
    '   （以及两个数据库密码）写进 .env。',
    '   过程中会要求输入超级用户的用户名和密码。',
  ]);

  if (EDITION === 'ee') {
    step('激活企业版许可', [
      '本包不包含许可。许可是单独交付给你的，形式是一个文件或一整行：',
      '  PINE_LICENSE_KEY=PINECONE-EE....',
      '',
      '1. 用记事本打开 .env，找到 PINE_LICENSE_KEY= 这一行，',
      '   把许可值粘到等号后面（必须一整行，不能换行）。',
      '2. 保存。许可在启动时读取。',
      '',
      '没有有效许可时服务仍会启动，但按社区版运行：企业版接口返回 403。',
      '在 logs\\backend.log 里看启动那一行即可确认：',
      '  [Edition] declared=enterprise effective=enterprise   许可生效',
      '  [Edition] declared=enterprise effective=community    未生效',
      '第二行会写明原因（缺失 / 已过期 / 签名不匹配）。',
    ]);
  }

  step('启动', [
    '双击 start.bat，浏览器会自动打开 http://localhost:6173',
    '会弹出两个最小化的窗口分别运行后端与前端，输出在 logs\\ 目录下。',
  ]);

  step('创建管理员账号（仅首次部署）', [
    '重要：你注册的第一个账号会自动成为平台管理员。',
    '系统里还没有任何用户时，start.bat 会打印提示。',
    '',
    '1. 在登录页选择「注册」，完成注册。',
    '2. 该账号即拥有管理后台：注册白名单、邀请码、SMTP 设置，',
    '   以及（企业版）许可管理。',
    '3. 然后打开 .env，把',
    '        FIRST_USER_BECOMES_ADMIN=false',
    '   改掉并重启，避免后续注册的人继承管理员权限。',
    '',
    '增加其他管理员：把邮箱写进 REGISTRATION_ADMIN_EMAILS，',
    '必须写在一行里、用英文逗号分隔（写成多行无效）。',
  ]);

  step('收紧注册（生产环境建议）', [
    '注册默认是开放的（.env 里 REGISTRATION_MODE=open）。可改成：',
    '  whitelist   只有白名单表里的邮箱能注册',
    '  invite      必须提供邀请码（可设使用次数与有效期）',
    '没有 closed 这个值：whitelist + 空白名单 = 谁都注册不了。',
    '修改 .env 后必须重启后端才生效。',
  ]);

  return [
    'Pinecone - ' +
      (EDITION === 'ee' ? '企业版' : '社区版') +
      ' 便携版 ' +
      VERSION +
      ' (' +
      PLATFORM +
      '-' +
      ARCH +
      ')',
    '======================================================================',
    '',
    '无需安装。已内置 Node.js，不需要 Redis。',
    '',
    '运行要求',
    '  - Windows 10/11 x64',
    '  - PostgreSQL 15 或更高版本，且本机能连上',
    EDITION === 'ee' ? '  - 组织专属的企业版许可密钥' : '  - 无其他依赖',
    '',
    ...steps,
    '自行准备数据库（可选）',
    '  - 创建角色 pinecone_app（作为 owner）和一个归属于它的数据库',
    '  - 用该角色执行 db\\schema.sql',
    '  - 手工填写 .env 里的 DATABASE_URL / DB_PASSWORD / APP_DB_PASSWORD',
    '',
    '日常使用',
    '  start.bat   启动全部服务',
    '  stop.bat    停止全部服务',
    '',
    '排查问题',
    '  logs\\backend.log    后端输出（数据库与许可信息都在这里）',
    '  logs\\frontend.log   前端输出',
    '',
    '端口与访问',
    '  3000  后端 API（/api、/api/docs）',
    '  6173  Web 界面',
    '  两者都可在 .env 修改：BACKEND_PORT / FRONTEND_PORT',
    '  局域网其他机器访问：http://<本机IP>:6173',
    '',
    '注意事项',
    '  - 上传的文件在 uploads\\',
    '  - 知识库协同数据在 data\\kb-collab\\',
    '  - 所有配置只在 .env 里改，改完需重启',
    '  - 升级：先停止，替换程序文件，保留 .env、uploads\\ 和 data\\',
    '',
  ].join('\r\n');
}

const EE_README_EXTRA_ZH = [
  '企业版说明',
  '  - 许可相关见上面「激活企业版许可」那一步。',
  '  - 企业模块位于 apps/backend/node_modules/@ee',
  '  - 本包适用独立的商业许可协议，见 EULA.txt；',
  '    不得再分发，也不得上传到任何公开仓库。',
  '',
].join('\r\n');

const EULA = [
  'PINECONE ENTERPRISE EDITION - END USER LICENSE AGREEMENT',
  '',
  'This software (the "Software") is licensed, not sold, to the authorised',
  'customer identified in the corresponding commercial order. Use of the Software',
  'is permitted only under the terms of a separate, signed commercial license',
  'agreement between you and the licensor.',
  '',
  '1. GRANT. Subject to payment and this Agreement, you may use the Software for',
  '   your internal business operations, for the number of seats / term stated in',
  '   your order.',
  '2. RESTRICTIONS. You shall not: (a) redistribute, sublicense, or make the',
  '   Software available to third parties; (b) reverse engineer, decompile, or',
  '   disassemble the Software except as permitted by applicable law; (c) remove',
  '   or obscure any license or proprietary notices.',
  '3. NO OPEN-SOURCE GRANT. This Enterprise Edition is proprietary. It is NOT',
  '   licensed under AGPL-3.0 or any other open-source license.',
  '4. TERMINATION. Any breach of this Agreement terminates your license',
  '   immediately, and you must cease all use and destroy all copies.',
  '',
  'This is a template. Replace with counsel-reviewed legal terms before',
  'distribution.',
  '',
].join('\r\n');

/**
 * 写中文版 README（UTF-8 + BOM）。抽成独立函数，供 --post-readme 复用：
 * 该模式只更新 stage 里的这一个文件再重新压缩，避免整套重拷贝（在大目录上
 * 拷贝可能被环境卡住）。
 */
function writeReadmeZhOnly() {
  const readmeZh = buildReadmeZh();
  fs.writeFileSync(
    path.join(STAGE, 'README_zh_cn.txt'),
    '\uFEFF' + (EDITION === 'ee' ? readmeZh + '\r\n' + EE_README_EXTRA_ZH : readmeZh),
    'utf8'
  );
}

function writeLaunchers() {
  fs.writeFileSync(path.join(STAGE, 'start.bat'), START_BAT, 'ascii');
  fs.writeFileSync(path.join(STAGE, 'stop.bat'), STOP_BAT, 'ascii');
  const readmeText = buildReadme();
  fs.writeFileSync(
    path.join(STAGE, 'README.txt'),
    EDITION === 'ee' ? readmeText + '\r\n' + EE_README_EXTRA : readmeText,
    'ascii'
  );

  // 中文版：UTF-8 + BOM（\uFEFF）。老版记事本靠 BOM 判编码，无 BOM 会显示乱码。
  writeReadmeZhOnly();
  if (EDITION === 'ee') {
    fs.writeFileSync(path.join(STAGE, 'EULA.txt'), EULA, 'ascii');
  }
  ensureDir(path.join(STAGE, 'bin'));
  fs.writeFileSync(path.join(STAGE, 'bin', 'run-backend.cmd'), RUN_BACKEND, 'ascii');
  fs.copyFileSync(
    path.join(__dirname, 'portable', 'run-frontend.js'),
    path.join(STAGE, 'bin', 'run-frontend.js')
  );
  fs.copyFileSync(
    path.join(__dirname, 'portable', 'link-ee.js'),
    path.join(STAGE, 'bin', 'link-ee.js')
  );

  // First-run database setup: schema.sql stays a plain auditable file, the
  // Node helper needs no psql on PATH and never pushes passwords through batch.
  fs.copyFileSync(
    path.join(__dirname, 'portable', 'setup-db.bat'),
    path.join(STAGE, 'setup-db.bat')
  );
  fs.copyFileSync(
    path.join(__dirname, 'portable', 'setup-db.js'),
    path.join(STAGE, 'bin', 'setup-db.js')
  );
  ensureDir(path.join(STAGE, 'db'));
  fs.copyFileSync(
    path.join(__dirname, 'portable', 'db', 'schema.sql'),
    path.join(STAGE, 'db', 'schema.sql')
  );

  // 存量库增量补丁（幂等 DDL）。schema.sql 只对全新库生效，已经跑过 setup-db 的
  // 实例要靠 db/patches + bin/patch-db.js 补结构，否则升级后运行期报 P2022。
  const patchSrcDir = path.join(__dirname, 'portable', 'db', 'patches');
  if (fs.existsSync(patchSrcDir)) {
    const patchStageDir = path.join(STAGE, 'db', 'patches');
    ensureDir(patchStageDir);
    for (const f of fs.readdirSync(patchSrcDir)) {
      if (!f.toLowerCase().endsWith('.sql')) continue;
      fs.copyFileSync(path.join(patchSrcDir, f), path.join(patchStageDir, f));
    }
  }
  fs.copyFileSync(
    path.join(__dirname, 'portable', 'patch-db.js'),
    path.join(STAGE, 'bin', 'patch-db.js')
  );
}

/**
 * Next's standalone tree keeps every package under node_modules/.pnpm/<pkg>@<ver>
 * and exposes them only through the internal .pnpm/node_modules symlink layer.
 * Dereferencing those links leaves a tree where `require('@swc/helpers')` from
 * next/dist cannot resolve (the sibling links live in a directory we never copied).
 * Flatten that layer into real top-level packages so plain Node resolution works.
 */
function flattenPnpmLayer(srcStandalone, stage) {
  // Enumerate from the SOURCE tree: the copy step drops dangling links, so the
  // staged .pnpm/node_modules is missing exactly the entries we need to restore.
  const layer = path.join(srcStandalone, 'node_modules', '.pnpm', 'node_modules');
  if (!fs.existsSync(layer)) {
    log('pnpm layer: none (already flat)');
    return;
  }
  const jobs = [];
  for (const name of fs.readdirSync(layer)) {
    const p = path.join(layer, name);
    if (name.startsWith('@')) {
      for (const sub of fs.readdirSync(p)) {
        jobs.push([path.join(p, sub), path.join(stage, 'node_modules', name, sub)]);
      }
    } else {
      jobs.push([p, path.join(stage, 'node_modules', name)]);
    }
  }
  let added = 0;
  let fellBack = 0;
  for (const [src, dst] of jobs) {
    if (fs.existsSync(dst)) continue;
    let real = tryRealpath(src);
    if (!real) {
      // Next's tracer prunes targets it believes are bundled into its server
      // chunks, leaving dangling links that runtime require() still follows
      // (react, react-dom, styled-jsx, sharp). Fall back to the workspace copy.
      const rel = path.relative(layer, src);
      for (const base of [path.join(ROOT, 'apps/frontend/node_modules'), path.join(ROOT, 'node_modules')]) {
        const fb = path.join(base, rel);
        if (!fs.existsSync(fb)) continue;
        real = tryRealpath(fb);
        if (real) {
          fellBack++;
          break;
        }
      }
    }
    if (!real) continue;
    if (fs.statSync(real).isDirectory()) copyFiltered(real, dst, null);
    else {
      ensureDir(path.dirname(dst));
      fs.copyFileSync(real, dst);
      copied++;
    }
    added++;
  }
  log('pnpm layer: flattened', added, 'packages (' + fellBack + ' from workspace fallback)');
}
function patchFrontendUrls() {
  const needleFrom = ['https://localhost:3000', 'wss://localhost:3000'];
  const needleTo = ['http://localhost:3000', 'ws://localhost:3000'];
  const exts = new Set(['.js', '.mjs', '.html', '.json', '.txt', '.rsc']);
  let patched = 0;
  const stack = [path.join(STAGE, 'apps', 'frontend')];
  while (stack.length) {
    const cur = stack.pop();
    for (const name of fs.readdirSync(cur)) {
      const p = path.join(cur, name);
      const st = fs.lstatSync(p);
      if (st.isDirectory()) {
        stack.push(p);
        continue;
      }
      if (!exts.has(path.extname(name).toLowerCase())) continue;
      let s = fs.readFileSync(p, 'utf8');
      const before = s;
      for (let i = 0; i < needleFrom.length; i++) s = s.split(needleFrom[i]).join(needleTo[i]);
      if (s !== before) {
        fs.writeFileSync(p, s, 'utf8');
        patched++;
      }
    }
  }
  log('frontend: rewrote localhost URLs in', patched, 'files');
}

// ------------------------------------------------- 3.5 交付物依赖漂移检查

/**
 * 交付物里的关键依赖是否比本地安装的旧。
 *
 * 背景（2026-11-26）：绿色包的前端来自 .next/standalone，里面**打包着构建时**的
 * 依赖版本。出现过的真实问题：源码把 next 升到 16.4.6、CI 也绿了，但没重打包，
 * 交付物里仍是 16.3.8 —— 带着两个 critical RCE。这类问题源码和 CI 都看不出来，
 * 只有打开包检查才发现。
 *
 * 只告警、不中断：确实需要回归旧版本时不该被卡死，但必须让人看见。
 */
const TRACKED_DEPS = ['next', 'react', 'react-dom'];

function readVersion(baseDir, name) {
  const p = path.join(baseDir, 'node_modules', name, 'package.json');
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')).version || null;
  } catch {
    return null;
  }
}

/** 比较 x.y.z；遇到预发布标记（含非数字段）则放弃比较返回 0 */
function cmpVersion(a, b) {
  const pa = String(a).split('.');
  const pb = String(b).split('.');
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = Number(pa[i] ?? 0);
    const y = Number(pb[i] ?? 0);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

function reportShippedVersions() {
  const shippedList = [];
  const stale = [];

  for (const name of TRACKED_DEPS) {
    const shipped = readVersion(STAGE, name);
    if (!shipped) continue;
    shippedList.push(name + ' ' + shipped);

    // 本地安装版本：优先前端包（依赖真正声明处），其次仓库根
    const local =
      readVersion(path.join(ROOT, 'apps/frontend'), name) || readVersion(ROOT, name);
    if (local && cmpVersion(shipped, local) < 0) {
      stale.push({ name, shipped, local });
    }
  }

  log('shipped deps:', shippedList.length ? shippedList.join(' | ') : '(未找到)');
  if (stale.length === 0) return;

  const bar = '!'.repeat(70);
  console.log('');
  console.log(bar);
  console.log('  WARNING: this package ships OLDER dependencies than the local install');
  for (const s of stale) {
    console.log('    - ' + s.name + ': shipped ' + s.shipped + ' < installed ' + s.local);
  }
  console.log('  .next/standalone carries the versions that existed at build time, so a');
  console.log('  dependency upgrade does NOT reach the package until the frontend is');
  console.log('  rebuilt. Rebuild it before packaging:');
  console.log('    node scripts/pack-portable.js --edition=' + EDITION + ' --build-frontend');
  console.log('  Otherwise the delivered package may contain known vulnerabilities.');
  console.log(bar);
  console.log('');
}

// ------------------------------------------------------------------- 4. zip

/**
 * 版本注入：包里每个可读的版本位都必须是发布版本。
 *
 * 2026-11-26 审计发现：zip 名和 README 写的是 1.0.2，但 stage 里的
 * apps/backend/package.json 仍是仓库的 0.1.0 —— 客户解压自查或任何读
 * package.json.version 的地方都会看到错版本。
 */
function stampVersion() {
  const targets = [
    path.join(STAGE, 'apps', 'backend', 'package.json'),
    path.join(STAGE, 'apps', 'frontend', 'package.json'),
  ];
  for (const p of targets) {
    if (!fs.existsSync(p)) continue;
    try {
      const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
      pkg.version = VERSION;
      fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + '\n');
    } catch (e) {
      log('WARN version stamp skipped: ' + path.relative(STAGE, p) + ' (' + e.message + ')');
    }
  }
  fs.writeFileSync(
    path.join(STAGE, 'VERSION.txt'),
    'version=' + VERSION + '\npackage=' + PKG_NAME + '\nbuilt=' + new Date().toISOString() + '\n',
  );
  log('version stamped:', VERSION);
}

function zipIt() {
  const out = path.join(STAGE_ROOT, PKG_NAME + '.zip');
  const py = ['python', 'python3', 'py'].find((c) => {
    try {
      execFileSync(c, ['--version'], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  });
  if (!py) fail('python not found; cannot build deflate zip');
  execFileSync(py, [path.join(__dirname, 'zip-deflate.py'), STAGE, out, '9'], {
    stdio: 'inherit',
  });
  return out;
}

// -------------------------------------------------------------------- main

(function main() {
  log('version', VERSION, '| edition', EDITION, '| api', API_URL);

  // --check-deps：只检查已存在的 stage 里关键依赖是否落后，不重新打包。
  // 配合 --stage=<dir> 可校验历史产物。
  if (hasFlag('--check-deps')) {
    if (!fs.existsSync(STAGE)) fail('stage dir not found: ' + STAGE);
    log('checking', path.relative(ROOT, STAGE));
    reportShippedVersions();
    return;
  }

  // --post-readme：只把中文 README 写进已存在的 stage 并重新压缩。
  // 用于环境不允许删除/大规模重拷贝时的小步更新。
  if (hasFlag('--post-readme')) {
    if (!fs.existsSync(STAGE)) fail('stage dir not found: ' + STAGE);
    writeReadmeZhOnly();
    log('wrote README_zh_cn.txt ->', path.relative(ROOT, path.join(STAGE, 'README_zh_cn.txt')));
    const out = zipIt();
    log('re-zipped:', path.relative(ROOT, out));
    return;
  }
  buildFrontend();

  // CE packages a prebuilt dist; EE compiles from a throwaway copy so that the
  // overlay never touches the public working tree.
  let distDir = path.join(ROOT, 'apps/backend/dist');
  if (EDITION === 'ee') {
    distDir = buildEnterpriseDist();
  } else {
    ceDistGuard(distDir);
  }
  checkInputs(distDir);
  installDeps();

  // Remove the @ee junction first: recursive removal must never traverse it, or
  // it walks into dist/modules (same tree) and the whole step stalls.
  const eeLink = path.join(STAGE, 'apps/backend/node_modules', '@ee');
  try {
    if (fs.existsSync(eeLink) || fs.lstatSync(eeLink, { throwIfNoEntry: false })) {
      fs.rmdirSync(eeLink);
      log('removed stale @ee junction from previous stage');
    }
  } catch {
    try {
      fs.unlinkSync(eeLink);
    } catch {}
  }

  if (fs.existsSync(STAGE)) {
    // Single recursive removal (allowed), avoids per-file unlink storms.
    fs.rmSync(STAGE, { recursive: true, force: true });
  }
  ensureDir(STAGE);

  log('copying backend dist ...');
  // 交付包不需要构建期副产物：
  //   .map   运行时不读，且 sources 字段暴露源码文件树
  //   .d.ts  运行时不读，但会把每个模块的接口、字段名、枚举值完整列出来
  // 两者合计约 6.7 MB，去掉后既能缩包，也少一份白送的结构说明。
  const skipBuildArtifacts = (dst) => !dst.endsWith('.map') && !dst.endsWith('.d.ts');
  copyFiltered(distDir, path.join(STAGE, 'apps/backend/dist'), skipBuildArtifacts);
  fs.copyFileSync(
    path.join(ROOT, 'apps/backend/package.json'),
    path.join(STAGE, 'apps/backend/package.json')
  );

  log('copying backend production deps (filtered) ...');
  copyTreeWithFilter(
    path.join(DEPS, 'node_modules'),
    path.join(STAGE, 'apps/backend/node_modules'),
    (rel) => !shouldDropPackage(rel) && keepRel(rel)
  );

  if (EDITION === 'ee') {
    // ee-gate resolves '@ee/<mod>/<mod>.module' at runtime. A copy here would be
    // one directory too shallow for compiled relative imports, and a zip cannot
    // carry a link, so bin/link-ee.js creates the junction at first start.
    log('enterprise: @ee junction is created at startup by bin/link-ee.js');
  }

  // Mirror docker/frontend.Dockerfile exactly: `COPY standalone ./` into the app
  // root, so server.js lands at <pkg>/apps/frontend/server.js with its traced
  // node_modules at <pkg>/node_modules. Next resolves .next relative to __dirname.
  log('copying frontend standalone (dir = <pkg>, same as docker /app) ...');
  // 与后端同理：.map / .d.ts 运行时不读。Next 会在 .next/server 下产出
  // 一批 server 端 sourcemap（实测 sources 为空、不含源码，纯属冗余），一并剔除。
  copyFiltered(
    path.join(ROOT, 'apps/frontend/.next/standalone'),
    STAGE,
    (dst) => !dst.endsWith('.map') && !dst.endsWith('.d.ts')
  );
  copyTreeWithFilter(
    path.join(ROOT, 'apps/frontend/.next/static'),
    path.join(STAGE, 'apps/frontend/.next/static'),
    keepRel
  );
  copyTreeWithFilter(
    path.join(ROOT, 'apps/frontend/public'),
    path.join(STAGE, 'apps/frontend/public'),
    keepRel
  );
  flattenPnpmLayer(path.join(ROOT, 'apps/frontend/.next/standalone'), STAGE);
  // standalone/apps/frontend/node_modules only mirrors `next`; the flattened
  // top-level copy is authoritative, so drop the duplicate.
  fs.rmSync(path.join(STAGE, 'apps/frontend/node_modules'), { recursive: true, force: true });

  log('copying bundled node runtime ...');
  ensureDir(path.join(STAGE, 'node'));
  fs.copyFileSync(
    path.join(path.dirname(process.execPath), 'node.exe'),
    path.join(STAGE, 'node', 'node.exe')
  );

  ensureDir(path.join(STAGE, 'uploads'));
  ensureDir(path.join(STAGE, 'logs'));
  ensureDir(path.join(STAGE, 'data', 'kb-collab'));

  writeEnv();
  writeLaunchers();
  patchFrontendUrls();

  // 版本注入：保证包内 package.json / VERSION.txt 与 zip 名、README 一致
  stampVersion();

  log('copied files:', copied, '| skipped:', skipped, '| dangling symlinks:', brokenLinks);
  const stageSize = sizeOf(STAGE);
  log('stage size (uncompressed):', MB(stageSize));

  // 交付物依赖漂移检查：包里的 next/react 若比本地安装的旧，醒目告警
  reportShippedVersions();

  if (!SKIP_ZIP) {
    const out = zipIt();
    const zs = fs.statSync(out).size;
    log('zip:', path.relative(ROOT, out), '->', MB(zs));
    if (zs > 100 * 1024 * 1024) {
      log('WARNING: zip exceeds 100 MB budget');
    } else {
      log('OK: within 100 MB budget');
    }
  }
})();
