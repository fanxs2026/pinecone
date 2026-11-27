'use strict';
/**
 * 前端「交付产物」构建入口（verify.bat 与 pack-portable 共用这一份实现）。
 *
 * 为什么必须共用：
 *   NEXT_PUBLIC_* 是构建期文本替换。如果构建时带着 dev 的
 *   `NEXT_PUBLIC_API_URL=https://localhost:3000/api`，打进包的就是 localhost，
 *   客户机装上去会请求自己的 localhost，整个前端连不上后端。
 *   正确做法是把这三个变量设为**空字符串**（存在但为空），lib/runtime-config.ts
 *   就会按 window.location 在运行期推导地址，一份产物通吃任何 host/端口。
 *
 * 为什么不能靠 .bat 的 `set VAR=`：
 *   cmd 的 `set VAR=` 是**删除**变量（Windows 无法存空环境变量）。变量不存在时
 *   Next 会回落到 apps/frontend/.env.local，把 dev 的 localhost 又读回来。
 *   所以由 Node 层传入空字符串，才能压住 .env.local。
 *
 * 用法：node scripts/build-frontend-pack.js
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const FE = path.join(ROOT, 'apps', 'frontend');
const nextBin = path.join(FE, 'node_modules', 'next', 'dist', 'bin', 'next');

if (!fs.existsSync(nextBin)) {
  console.error('[build-frontend] next binary not found: ' + nextBin + '\n  run pnpm install first');
  process.exit(1);
}

console.log('[build-frontend] building with NEXT_PUBLIC_* forced empty (runtime URL resolution) ...');

const env = { ...process.env, NODE_OPTIONS: '' };
// 空字符串（不是删除）：@next/env 只在变量为 undefined 时才写入 .env.local 的值
env.NEXT_PUBLIC_API_URL = '';
env.NEXT_PUBLIC_WS_URL = '';
env.NEXT_PUBLIC_KB_COLLAB_URL = '';

const res = spawnSync(process.execPath, [nextBin, 'build'], {
  cwd: FE,
  stdio: 'inherit',
  env,
});

if (res.status !== 0) {
  console.error('[build-frontend] failed with exit code ' + res.status);
  process.exit(res.status || 1);
}

// 构建后自检：产物里不允许出现硬编码的 localhost API 地址
const staticDir = path.join(FE, '.next', 'static');
let leaked = false;
if (fs.existsSync(staticDir)) {
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && /\.js$/.test(e.name)) {
        const txt = fs.readFileSync(p, 'utf8');
        if (/https?:\/\/localhost:3000\/api/.test(txt)) {
          console.error('[build-frontend] LEAK: hardcoded localhost API found in ' + path.relative(ROOT, p));
          leaked = true;
        }
      }
    }
  };
  walk(staticDir);
}
if (leaked) {
  console.error('[build-frontend] 产物含硬编码 localhost，打包会污染客户机。检查 apps/frontend/.env.local 与调用方注入。');
  process.exit(1);
}

console.log('[build-frontend] ok — output has no hardcoded localhost API');
