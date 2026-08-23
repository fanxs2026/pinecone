#!/usr/bin/env bash
# Pinecone 社区版构建（默认，Open Core 公开仓库）
# 不加载任何 overlay，编译产物不含企业功能实现。
set -euo pipefail
cd "$(dirname "$0")/.."
export PINE_EDITION=community
echo "[build-community] PINE_EDITION=community"
pnpm --filter @pinecone/backend build
pnpm --filter @pinecone/frontend build
echo "[build-community] done (community edition, no overlay)"
