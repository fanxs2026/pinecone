#!/usr/bin/env node
'use strict';
/**
 * 生成「受浏览器信任」的本地开发证书 —— 一条命令搞定。
 *
 * 两种模式，自动选：
 *   1) 有 mkcert   → 用 mkcert（业界标准做法）
 *   2) 没有 mkcert → 用本机 openssl 自建本地 CA，并把 CA 装进系统受信任根
 *      （网络受限、装不了 mkcert 时照样可用，实测 2026-11-28）
 *
 * 为什么需要它：
 *   scripts/gen-cert.sh 生成的是**自签证书**，浏览器不认。每台机器都要手动把根证书
 *   导入受信任存储，否则会出现「页面能开、接口请求被证书拦」的假故障
 *   （2026-11-28 实测：登录接口 Failed to fetch，前端却提示"请检查邮箱和密码"）。
 *
 * 用法：
 *   pnpm cert:dev            # 或 node scripts/dev-cert.js
 *   node scripts/dev-cert.js --mkcert-only   # 只用 mkcert（未安装则失败）
 *   node scripts/dev-cert.js --openssl-only  # 强制走自建 CA
 *   node scripts/dev-cert.js --no-trust      # 只签发证书，不碰系统信任库（CI 用）
 *   node scripts/dev-cert.js --clean         # 打印卸载本地 CA 的命令
 *
 * 产物路径与 .env / 前端 dev 脚本完全一致（生成后无需改任何配置）：
 *   后端 HTTPS_CERT_PATH=certs/pinecone.crt / HTTPS_KEY_PATH=certs/pinecone.key
 *   前端 next dev --experimental-https-key ../../certs/pinecone.key ...
 */
const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CERT_DIR = path.join(ROOT, 'certs');
const CERT_FILE = path.join(CERT_DIR, 'pinecone.crt');
const KEY_FILE = path.join(CERT_DIR, 'pinecone.key');
const CA_CERT = path.join(CERT_DIR, 'devCA.crt');
const CA_KEY = path.join(CERT_DIR, 'devCA.key');
const HOSTS = ['localhost', '127.0.0.1', '::1'];
const SAN = 'DNS:localhost,IP:127.0.0.1,IP:::1';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const isWin = process.platform === 'win32';

const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
const step = (m) => console.log(`\n▶ ${m}`);
const ok = (m) => console.log(`  ✅ ${m}`);
const info = (m) => console.log(`  ·  ${m}`);
const warn = (m) => console.log(`  ⚠️  ${m}`);
function die(msg, hint) {
  console.error(`\n❌ ${msg}`);
  if (hint) console.error(hint);
  process.exit(1);
}

function run(bin, args, { allowFail = false, timeout = 120000 } = {}) {
  const res = spawnSync(bin, args, { encoding: 'utf8', windowsHide: true, timeout });
  const out = `${res.stdout || ''}${res.stderr || ''}`.trim();
  if ((res.status !== 0 || res.error) && !allowFail) {
    die(`命令失败：${path.basename(bin)} ${args.join(' ')}`, out || String(res.error || ''));
  }
  return { status: res.status, out };
}

/** 在 PATH 与常见安装位置里找可执行文件 */
function findBin(name, extraDirs = []) {
  const exe = isWin ? `${name}.exe` : name;
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const candidates = [
    ...dirs.map((d) => path.join(d, exe)),
    ...extraDirs.map((d) => path.join(d, exe)),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}

function findOpenSsl() {
  const extra = isWin
    ? [
        'C:\\Program Files\\Git\\usr\\bin',
        'C:\\Program Files (x86)\\Git\\usr\\bin',
        'C:\\Program Files\\Git\\mingw64\\bin',
      ]
    : ['/usr/bin', '/usr/local/bin', '/opt/homebrew/bin'];
  return findBin('openssl', extra);
}

function findMkcert() {
  const extra = isWin
    ? [
        path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'mkcert'),
        path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links'),
        path.join(process.env.ProgramData || 'C:\\ProgramData', 'chocolatey', 'bin'),
      ]
    : ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'];
  return findBin('mkcert', extra);
}

/** 读取证书基本信息（Node 内置能力，不依赖 openssl） */
function inspectCert(file) {
  const x = new crypto.X509Certificate(fs.readFileSync(file));
  return {
    subject: x.subject.replace(/\n/g, ', '),
    issuer: x.issuer.replace(/\n/g, ', '),
    validTo: x.validTo,
    san: x.subjectAltName || '(none)',
    fingerprint: x.fingerprint256,
  };
}

/** 把 CA 装进系统受信任根（幂等） */
function trustCA(caPath) {
  if (has('--no-trust')) {
    warn('已跳过信任导入（--no-trust）');
    return false;
  }
  if (isWin) {
    // 用 .NET X509Store：静默、不需管理员、不弹「是否安装证书」对话框
    // （certutil -addstore 会弹 UI；Import-Certificate 会报「此操作中不允许使用 UI」）
    const p = caPath.replace(/'/g, "''");
    const ps = [
      `$c = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2('${p}')`,
      `$s = New-Object System.Security.Cryptography.X509Certificates.X509Store('Root','CurrentUser')`,
      `$s.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)`,
      `$s.Add($c); $s.Close()`,
      `$check = Get-ChildItem Cert:\\CurrentUser\\Root | Where-Object { $_.Thumbprint -eq $c.Thumbprint }`,
      `if ($check) { 'OK ' + $c.Thumbprint } else { 'MISS' }`,
    ].join('; ');
    const r = run('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { allowFail: true });
    if (r.out.includes('OK ')) {
      ok(`已加入受信任根（当前用户）：${r.out.split('OK ')[1].trim()}`);
      return true;
    }
    warn('信任导入失败，可手动导入：双击 ' + rel(caPath) + ' → 安装到「受信任的根证书颁发机构」');
    if (r.out) info(r.out.split('\n').slice(-1)[0]);
    return false;
  }
  if (process.platform === 'darwin') {
    const r = run('security', [
      'add-trusted-cert', '-d', '-r', 'trustRoot',
      '-k', path.join(os.homedir(), 'Library/Keychains/login.keychain-db'), caPath,
    ], { allowFail: true });
    if (r.status === 0) { ok('已加入 macOS 登录钥匙串（受信任根）'); return true; }
    warn('信任导入失败，请手动执行：security add-trusted-cert -d -r trustRoot -k ~/Library/Keychains/login.keychain-db ' + rel(caPath));
    return false;
  }
  warn('Linux 需手动受信：');
  info(`sudo cp ${rel(caPath)} /usr/local/share/ca-certificates/pinecone-dev-ca.crt`);
  info('sudo update-ca-certificates');
  return false;
}

/** mkcert 模式 */
function useMkcert(mkcert) {
  const v = run(mkcert, ['--version'], { allowFail: true }).out.split('\n')[0];
  ok(`mkcert: ${mkcert}${v ? ` (${v})` : ''}`);

  if (!has('--no-trust')) {
    step('安装本地 CA 到系统信任库');
    const r = run(mkcert, ['-install'], { allowFail: true });
    if (r.status === 0) ok(r.out.split('\n').filter(Boolean).slice(-1)[0] || 'CA 已就绪');
    else {
      warn('CA 安装未成功（Windows 可能弹出根证书确认框，需点「是」）');
      if (r.out) info(r.out.split('\n').slice(-1)[0]);
    }
  }

  step('签发证书');
  fs.mkdirSync(CERT_DIR, { recursive: true });
  backupExisting();
  run(mkcert, ['-cert-file', CERT_FILE, '-key-file', KEY_FILE, ...HOSTS]);
  return CERT_FILE;
}

/** openssl 自建 CA 模式（无外部依赖，网络受限时可用） */
function useOpenssl() {
  const openssl = findOpenSsl();
  if (!openssl) {
    die(
      '既没有 mkcert，也没找到 openssl',
      '\nGit Bash 自带 openssl（C:\\Program Files\\Git\\usr\\bin\\openssl.exe）。\n' +
        '若已安装 Git，确认该路径存在后重试；否则安装 mkcert：winget install FiloSottile.mkcert',
    );
  }
  const ver = run(openssl, ['version'], { allowFail: true }).out;
  ok(`openssl: ${ver || rel(openssl)}`);

  fs.mkdirSync(CERT_DIR, { recursive: true });
  const tmp = path.join(CERT_DIR, `.tmp-${Date.now()}`);
  fs.mkdirSync(tmp, { recursive: true });
  const tmpCrt = path.join(tmp, 'pinecone.crt');
  const tmpKey = path.join(tmp, 'pinecone.key');
  const tmpCsr = path.join(tmp, 'pinecone.csr');
  const tmpExt = path.join(tmp, 'ext.cnf');

  // 1) 本地根 CA（长期复用；已存在则沿用，避免每次换 CA 都要重新信任）
  step('准备本地根 CA');
  if (fs.existsSync(CA_CERT) && fs.existsSync(CA_KEY)) {
    const ca = inspectCert(CA_CERT);
    ok(`复用已有 CA：${ca.subject}`);
    info(`有效期至 ${new Date(ca.validTo).toISOString().slice(0, 10)}`);
  } else {
    run(openssl, [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '3650',
      '-keyout', CA_KEY, '-out', CA_CERT,
      '-subj', '/CN=Pinecone Local Dev CA/O=Pinecone Dev',
      '-addext', 'basicConstraints=critical,CA:TRUE,pathlen:0',
      '-addext', 'keyUsage=critical,keyCertSign,cRLSign',
      '-addext', 'subjectKeyIdentifier=hash',
    ]);
    ok(`已生成 CA：${rel(CA_CERT)}（有效期 10 年）`);
  }

  // 2) 装进系统受信任根（必须在覆盖服务证书之前完成，失败就别动现有证书）
  step('把 CA 装进系统受信任根');
  const trusted = trustCA(CA_CERT);
  if (!trusted && !has('--no-trust')) {
    warn('继续生成证书，但浏览器仍会报「不是私密连接」直到 CA 被信任');
  }

  // 3) 签发服务证书（先写临时目录，全部成功再替换，避免半成品破坏现状）
  step('签发服务证书');
  run(openssl, [
    'req', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', tmpKey, '-out', tmpCsr,
    '-subj', '/CN=localhost',
  ]);
  fs.writeFileSync(
    tmpExt,
    ['basicConstraints=CA:FALSE', 'keyUsage=critical,digitalSignature,keyEncipherment',
     'extendedKeyUsage=serverAuth', `subjectAltName=${SAN}`, ''].join('\n'),
  );
  const serial = path.join(tmp, 'ca.srl');
  run(openssl, [
    'x509', '-req', '-in', tmpCsr,
    '-CA', CA_CERT, '-CAkey', CA_KEY, '-CAcreateserial', '-CAserial', serial,
    '-out', tmpCrt, '-days', '825', '-sha256', '-extfile', tmpExt,
  ]);

  backupExisting();
  fs.copyFileSync(tmpCrt, CERT_FILE);
  fs.copyFileSync(tmpKey, KEY_FILE);

  // 清理临时目录（一次性，不循环）
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* 忽略 */ }
  return CERT_FILE;
}

function backupExisting() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  for (const f of [CERT_FILE, KEY_FILE]) {
    if (fs.existsSync(f)) {
      const bak = `${f}.bak-${stamp}`;
      fs.copyFileSync(f, bak);
      info(`旧文件已备份：${rel(bak)}`);
    }
  }
}

(function main() {
  console.log('Pinecone — 本地受信开发证书');

  let mode = '';
  let mkcert = null;
  if (!has('--openssl-only')) mkcert = findMkcert();

  if (mkcert && !has('--openssl-only')) {
    mode = 'mkcert';
    useMkcert(mkcert);
  } else {
    if (has('--mkcert-only')) die('未找到 mkcert', 'winget install FiloSottile.mkcert');
    if (!has('--openssl-only')) {
      if (!mkcert) info('未找到 mkcert，改用 openssl 自建本地 CA（无需联网、无需安装）');
    }
    mode = 'openssl';
    useOpenssl();
  }

  // 自检
  step('证书自检');
  try {
    const c = inspectCert(CERT_FILE);
    ok(`Subject : ${c.subject}`);
    ok(`Issuer  : ${c.issuer}`);
    ok(`有效至  : ${new Date(c.validTo).toISOString().slice(0, 10)}`);
    ok(`SAN     : ${c.san}`);
    // IPv6 回环在证书里可能显示成 ::1 或 0:0:0:0:0:0:0:1，两种都算覆盖
    const san = (c.san || '').toLowerCase();
    const covered = HOSTS.every((h) =>
      h === '::1' ? san.includes('::1') || san.includes('0:0:0:0:0:0:0:1') : san.includes(h.toLowerCase()),
    );
    if (!covered) warn(`SAN 未覆盖全部主机（期望 ${HOSTS.join(', ')}）`);
    info(`SHA-256 : ${c.fingerprint}`);
  } catch (e) {
    warn(`证书解析失败：${e.message}`);
  }

  console.log('\n下一步：');
  console.log('  1) 重启后端：node apps/backend/dist/main.js');
  console.log('  2) 重启前端：pnpm --filter frontend dev');
  console.log('  3) **完全退出浏览器再打开**（旧进程缓存了证书拒绝决定，只关标签页无效）');
  console.log('  4) 验证：直接访问 https://localhost:3000/api/health 应返回 JSON 且无警告');
  console.log('\n.env 无需改动：HTTPS_CERT_PATH=certs/pinecone.crt / HTTPS_KEY_PATH=certs/pinecone.key');

  if (has('--clean')) {
    console.log('\n卸载本地 CA（不再需要时）：');
    if (mode === 'mkcert') console.log(`  ${mkcert} -uninstall`);
    else if (isWin) {
      console.log('  PowerShell:');
      console.log('    Get-ChildItem Cert:\\CurrentUser\\Root | Where-Object { $_.Subject -like "*Pinecone Local Dev CA*" } | Remove-Item');
    } else if (process.platform === 'darwin') {
      console.log('  security delete-certificate -c "Pinecone Local Dev CA" ~/Library/Keychains/login.keychain-db');
    } else {
      console.log('  sudo rm /usr/local/share/ca-certificates/pinecone-dev-ca.crt && sudo update-ca-certificates --fresh');
    }
    console.log('  再删除 certs/devCA.crt 与 certs/devCA.key');
  }

  console.log(`\n✅ 完成（模式：${mode}）\n`);
})();
