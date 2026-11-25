#!/usr/bin/env node
'use strict';
/**
 * 许可证台账查看 / 续期提醒（厂商侧）。
 *
 * 台账由 scripts/license-issue.js 写入，位置与私钥同目录（仓库外）：
 *   ../pinecone-license-keys/ledger.json
 *
 * 用法：
 *   node scripts/license-list.js                 列出全部，按到期排序
 *   node scripts/license-list.js --expiring 60   只看 60 天内到期的
 *   node scripts/license-list.js --expiring 30 --quiet
 *
 * 退出码：0 = 无即将到期；1 = 有即将到期（方便接 CI / 定时任务做告警）
 */
const path = require('path');
const fs = require('fs');

/**
 * 签发工具已移到仓库外（pinecone-license-keys/tools），本脚本只读台账，
 * 因此在此内联所需的三个小 helper，不再依赖 lib/licence-key。
 */
const DAY_MS = 86400000;
const KEYS_DIR =
  process.env.PINECONE_KEYS_DIR || path.resolve(__dirname, '..', '..', 'pinecone-license-keys');

function ledgerPath(keyDir) {
  return path.join(keyDir || KEYS_DIR, 'ledger.json');
}

function readLedger(keyDir) {
  const file = ledgerPath(keyDir);
  if (!fs.existsSync(file)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : fallback;
}
const has = (name) => process.argv.includes('--' + name);

const keyDir = arg('key-dir', '');
const expiringWithin = has('expiring') ? Number(arg('expiring', '0')) : 0;
const quiet = has('quiet');

const rows = readLedger(keyDir)
  .map((r) => ({ ...r, ts: new Date(r.expiresAt).getTime() }))
  .sort((a, b) => a.ts - b.ts);

if (rows.length === 0) {
  console.log('[lic] 台账为空：' + ledgerPath(keyDir));
  console.log('[lic] 用 scripts/license-issue.js 签第一张许可。');
  process.exit(0);
}

const now = Date.now();
const threshold = expiringWithin > 0 ? now + expiringWithin * DAY_MS : Number.POSITIVE_INFINITY;
const selected = rows.filter((r) => r.ts <= threshold);

const fmt = (ts) => new Date(ts).toISOString().slice(0, 10);
const days = (ts) => Math.floor((ts - now) / DAY_MS);

if (!quiet) {
  console.log('');
  console.log('[lic] 台账: ' + ledgerPath(keyDir));
  console.log(
    '  ' +
      '编号'.padEnd(20) +
      '客户'.padEnd(22) +
      '席位'.padStart(4) +
      '  ' +
      '到期'.padEnd(12) +
      '剩余'
  );
  for (const r of selected) {
    const d = days(r.ts);
    const flag = d < 0 ? '已过期' : d <= 30 ? '⚠ ' + d + '天' : d + '天';
    console.log(
      '  ' +
        String(r.id).padEnd(20) +
        String(r.customer).slice(0, 20).padEnd(22) +
        String(r.seats ?? '-').padStart(4) +
        '  ' +
        fmt(r.ts).padEnd(12) +
        flag
    );
  }
  console.log('');
}

const expiringCount = selected.filter((r) => r.ts > now && r.ts <= threshold).length;
const expiredCount = selected.filter((r) => r.ts <= now).length;

if (expiringWithin > 0) {
  if (quiet) {
    if (expiringCount + expiredCount > 0) {
      console.log(
        `[lic] ${expiringCount} 张 ${expiringWithin} 天内到期，${expiredCount} 张已过期`
      );
      for (const r of selected) {
        console.log(`      ${r.id} ${r.customer} -> ${fmt(r.ts)} (${days(r.ts)}天)`);
      }
    }
  }
  process.exit(expiringCount + expiredCount > 0 ? 1 : 0);
}

process.exit(0);
