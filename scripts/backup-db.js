#!/usr/bin/env node
/**
 * Pinecone 数据库备份脚本（Phase 2-①）
 *
 * 流程：pg_dump（-Fc）→ gzip → AES-256-GCM 加密 → backups/pinecone_<ts>.dump.gz.enc
 * 纯 Node 实现（zlib + crypto 内置），仅依赖 pg_dump。
 * 保留策略：默认保留最近 14 份（--keep 可调），更旧自动清理。
 *
 * 用法：
 *   node scripts/backup-db.js [--out-dir backups] [--keep 14]
 * 密钥：环境变量 BACKUP_ENCRYPTION_KEY（优先），否则首次运行自动生成并写入 backups/.backup-key
 *       （该文件务必妥善保管/放入密钥管理系统；丢失则备份无法解密）
 */
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const os = require('os');

// ---- 配置 ----
const ROOT = path.resolve(__dirname, '..');
const outDir = process.argv[2] === '--out-dir' ? path.resolve(process.argv[3] || 'backups') : path.join(ROOT, 'backups');
const keep = (() => {
  const i = process.argv.indexOf('--keep');
  const n = i > -1 ? Number(process.argv[i + 1]) : 14;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 14;
})();

// ---- 读 .env 数据库连接（备份用 admin 凭据，SHADOW_DATABASE_URL 是 DDL 账号）----
function loadEnv() {
  try {
    const txt = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
    const get = (k) => { const m = txt.match(new RegExp(`^${k}=(.*)$`, 'm')); return m ? m[1] : ''; };
    return { shadow: get('SHADOW_DATABASE_URL'), main: get('DATABASE_URL') };
  } catch { return { shadow: '', main: '' }; }
}

/** 备份连接串：admin 凭据 + 主库名 */
function buildBackupUrl(shadow, main) {
  const su = new URL(shadow || main);
  const mu = new URL(main || shadow);
  su.pathname = mu.pathname; // 指向主库
  return su.toString();
}

// ---- 找 pg_dump ----
function findPgDump() {
  if (process.env.PGDUMP_PATH) return process.env.PGDUMP_PATH;
  const candidates = [];
  if (process.platform === 'win32') {
    const base = 'C:\\Program Files\\PostgreSQL';
    if (fs.existsSync(base)) {
      for (const v of fs.readdirSync(base).sort()) {
        const p = path.join(base, v, 'bin', 'pg_dump.exe');
        if (fs.existsSync(p)) candidates.push(p);
      }
    }
    // Homebrew/手动安装
    const app = 'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe';
    if (fs.existsSync(app)) candidates.push(app);
  } else {
    try { candidates.push(execSync('which pg_dump', { encoding: 'utf8' }).trim()); } catch {}
  }
  return candidates[0] || null;
}

// ---- 密钥 ----
function getKey() {
  if (process.env.BACKUP_ENCRYPTION_KEY) return Buffer.from(process.env.BACKUP_ENCRYPTION_KEY, 'hex');
  const keyFile = path.join(outDir, '.backup-key');
  if (fs.existsSync(keyFile)) {
    return Buffer.from(fs.readFileSync(keyFile, 'utf8').trim(), 'hex');
  }
  const key = crypto.randomBytes(32);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(keyFile, key.toString('hex') + os.EOL, { mode: 0o600 });
  console.warn(`[backup] 已生成加密密钥文件: ${keyFile}`);
  console.warn('[backup] ⚠️ 请立即将密钥放入安全位置（密码管理器/密钥管理系统），此文件丢失将无法解密备份');
  return key;
}

// ---- 主流程 ----
async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const { shadow, main: mainUrl } = loadEnv();
  if (!mainUrl) { console.error('[backup] .env 缺少 DATABASE_URL'); process.exit(1); }
  const backupUrl = buildBackupUrl(shadow, mainUrl);
  const pgDump = findPgDump();
  if (!pgDump) { console.error('[backup] 找不到 pg_dump（设置 PGDUMP_PATH 或安装 PostgreSQL 客户端）'); process.exit(1); }

  const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '_');
  const rawFile = path.join(outDir, `pinecone_${ts}.dump.gz.enc`);
  const key = getKey();
  const iv = crypto.randomBytes(12);

  console.log(`[backup] pg_dump -> gzip -> aes-256-gcm -> ${path.basename(rawFile)}`);

  const dump = spawn(pgDump, ['-Fc', '--no-owner', '--no-privileges', backupUrl], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  dump.stderr.on('data', (d) => { stderr += d; });

  const gzip = zlib.createGzip();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const out = fs.createWriteStream(rawFile);
  dump.stdout.pipe(gzip).pipe(cipher).pipe(out);

  await new Promise((resolve, reject) => {
    out.on('finish', resolve);
    out.on('error', reject);
    dump.on('error', reject);
  });
  if (stderr.trim()) { console.error(`[backup] pg_dump 警告/错误:\n${stderr.trim().slice(0, 2000)}`); }

  // 追加 iv + authTag（文件头 12 字节 iv + 16 字节 tag，解密时先读回）
  const authTag = cipher.getAuthTag();
  fs.appendFileSync(rawFile, Buffer.concat([iv, authTag]));
  console.log(`[backup] ✅ 完成: ${rawFile} (${(fs.statSync(rawFile).size / 1024).toFixed(1)} KB)`);

  // 清单
  const manifestPath = path.join(outDir, 'manifest.json');
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { backups: [] };
  manifest.backups.push({ file: path.basename(rawFile), createdAt: new Date().toISOString(), sizeBytes: fs.statSync(rawFile).size });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  // 保留策略：按文件名时间戳排序，删除超出 keep 的旧备份
  const files = fs.readdirSync(outDir).filter((f) => /^pinecone_.*\.dump\.gz\.enc$/.test(f)).sort();
  const excess = files.length - keep;
  if (excess > 0) {
    for (const f of files.slice(0, excess)) {
      fs.unlinkSync(path.join(outDir, f));
      console.log(`[backup] 清理旧备份: ${f}`);
    }
  }
  console.log(`[backup] 当前保留 ${Math.min(files.length, keep)} 份（上限 ${keep}）`);
}

main().catch((err) => { console.error('[backup] 失败:', err.message); process.exit(1); });
