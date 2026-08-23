#!/usr/bin/env bash
# ============================================================
# Pinecone 升级发布脚本（Docker 方式，第 2 次起的增量发布）
# 用法（在项目根）：
#   ./scripts/deploy-upgrade.sh [--env-file .env] [--skip-backup]
# 前置：docker compose 可用；首次部署已完成（本脚本不做首次初始化）
# ============================================================
set -euo pipefail

cd "$(dirname "$0")/.."
ENV_FILE="${1:-.env}"
SKIP_BACKUP="${2:-}"

if [ ! -f "$ENV_FILE" ]; then
  echo "!! 环境文件不存在: $ENV_FILE （可用 cp docker/.env.prod.example $ENV_FILE 创建）"
  exit 1
fi

echo "==> [1/5] 备份数据库"
if [ "$SKIP_BACKUP" = "--skip-backup" ]; then
  echo "    （已跳过）"
else
  mkdir -p backups
  TS=$(date +%Y%m%d-%H%M%S)
  docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" exec -T postgres \
    pg_dump -U pinecone_admin -d pinecone -Fc > "backups/pinecone-$TS.dump"
  echo "    备份完成: backups/pinecone-$TS.dump"
fi

echo "==> [2/5] 拉取最新代码"
if [ -d .git ]; then
  git pull --ff-only
else
  echo "    （非 git 目录，跳过拉取——请手动上传新代码后继续）"
fi

echo "==> [3/5] 重新构建并启动（schema 变更由 backend 容器 CMD 内 db push 处理）"
docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" up -d --build

echo "==> [4/5] 等待服务就绪"
for i in $(seq 1 20); do
  if curl -sf "http://localhost:${BACKEND_PORT:-3000}/api/health" >/dev/null 2>&1; then
    echo "    backend 就绪（第 ${i} 次探测）"
    break
  fi
  [ "$i" = 20 ] && { echo "!! backend 未在预期时间内就绪，请查看日志: docker compose logs backend"; exit 1; }
  sleep 3
done

echo "==> [5/5] 服务状态"
docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" ps
echo ""
echo "✅ 升级完成。建议人工冒烟：登录 → 概览统计 → 看板拖拽 → 附件上传"
