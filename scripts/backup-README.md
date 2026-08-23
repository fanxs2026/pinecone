# Pinecone 数据库备份（Phase 2-①）

## 能力

- `node scripts/backup-db.js [--out-dir backups] [--keep 14]`
  - 流程：`pg_dump -Fc` → gzip → **AES-256-GCM 加密** → `backups/pinecone_<时间戳>.dump.gz.enc`
  - 密钥：`BACKUP_ENCRYPTION_KEY`（hex）优先，否则首次运行生成 `backups/.backup-key`（⚠️ 妥善保管，丢失无法解密）
  - 保留策略：默认保留最近 14 份，更旧自动清理；清单记录于 `backups/manifest.json`
- `node scripts/decrypt-backup.js <备份文件> [输出目录]`
  - 解密 → `.dump.gz` → `pg_restore -d <库> <文件>`

## 定时执行（部署环境配置）

Windows 任务计划程序（示例，每天 02:00）：
```
schtasks /Create /SC DAILY /ST 02:00 /TN "PineconeBackup" /TR "node D:\Workspace\project\Pinecone\scripts\backup-db.js"
```

Linux cron（示例，每天 02:00，密钥走环境变量）：
```
0 2 * * * BACKUP_ENCRYPTION_KEY=<hex> node /opt/pinecone/scripts/backup-db.js --out-dir /var/backups/pinecone --keep 30
```

## 生产要点

1. 密钥放密钥管理系统（不落盘或落盘 0600），生产禁用自动生成的 `.backup-key`
2. 备份文件与数据库**异机存放**（防磁盘故障同时丢失）
3. 保留期按安全策略配置（默认 14 天；合规要求更高时用 `--keep` 调整）
4. 恢复演练：定期用 `decrypt-backup.js` + `pg_restore` 到测试库验证备份可用
5. 还原完整流程（含权限账号）参考项目 memory 中「数据库-还原流程」

## 验证（2026-08-09 实测）

```
pg_dump -> gzip -> aes-256-gcm -> pinecone_20260809_130543.dump.gz.enc (266.1 KB)
当前保留 1 份（上限 14）
```
