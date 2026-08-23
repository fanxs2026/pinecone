#!/usr/bin/env node
/**
 * 备份解密工具（配合 scripts/backup-db.js 使用）
 * 用法：node scripts/decrypt-backup.js <backup-file> [输出目录]
 * 密钥：环境变量 BACKUP_ENCRYPTION_KEY（hex），否则读 backups/.backup-key
 * 产物：<backup-file>.dump.gz（再 pg_restore 恢复）
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

const file = process.argv[2];
if (!file) { console.error('用法: node scripts/decrypt-backup.js <backup.dump.gz.enc> [输出目录]'); process.exit(1); }
const outDir = process.argv[3] ? path.resolve(process.argv[3]) : path.dirname(file);
const keyFile = path.join(path.resolve(__dirname, '..', 'backups'), '.backup-key');

function getKey() {
  if (process.env.BACKUP_ENCRYPTION_KEY) return Buffer.from(process.env.BACKUP_ENCRYPTION_KEY, 'hex');
  if (fs.existsSync(keyFile)) return Buffer.from(fs.readFileSync(keyFile, 'utf8').trim(), 'hex');
  console.error('未找到密钥（设置 BACKUP_ENCRYPTION_KEY 或提供 backups/.backup-key）'); process.exit(1);
}

const buf = fs.readFileSync(file);
const iv = buf.slice(buf.length - 28, buf.length - 16);
const tag = buf.slice(buf.length - 16);
const key = getKey();

try {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const raw = Buffer.concat([decipher.update(buf.slice(0, buf.length - 28)), decipher.final()]);
  // 解 gzip
  const gz = zlib.gunzipSync(raw);
  const out = path.join(outDir, path.basename(file).replace('.gz.enc', ''));
  fs.writeFileSync(out, gz);
  console.log(`✅ 解密完成: ${out} (${(gz.length / 1024).toFixed(1)} KB)`);
  console.log(`恢复命令: pg_restore -d <目标库> "${out}"`);
} catch (e) {
  console.error('解密失败（密钥错误或文件损坏）:', e.message);
  process.exit(1);
}
