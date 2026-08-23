#!/usr/bin/env bash
# Pinecone 企业版构建（本地 overlay，不进公开仓库）
# 用法：./scripts/build-ee.sh /path/to/pinecone-overlay
# 将 overlay 的企业模块/页面叠加进主仓库对应路径，再以 enterprise 构建。
set -euo pipefail
cd "$(dirname "$0")/.."
OVERLAY="${1:-../pinecone-overlay}"
if [ ! -d "$OVERLAY" ]; then
  echo "[build-ee] ERROR: overlay dir not found: $OVERLAY" >&2
  exit 1
fi
export PINE_EDITION=enterprise
echo "[build-ee] PINE_EDITION=enterprise, overlay=$OVERLAY"

# 1) 后端：overlay 企业模块覆盖主仓库 modules（community 内核 service 保留，controller 由 overlay 提供）
OVERLAY_BE="$OVERLAY/backend/modules/ee"
if [ -d "$OVERLAY_BE" ]; then
  for m in "$OVERLAY_BE"/*; do
    name=$(basename "$m")
    rm -rf "apps/backend/src/modules/$name"
    cp -r "$m" "apps/backend/src/modules/$name"
  done
  echo "[build-ee] backend EE modules overlaid"
fi

# 2) 前端：overlay 企业页面覆盖主仓库 admin 页面 + api-client-ee 合并（按 overlay 内 README 说明）
OVERLAY_FE="$OVERLAY/frontend"
if [ -d "$OVERLAY_FE/admin/ee" ]; then
  cp -rn "$OVERLAY_FE/admin/ee/." "apps/frontend/src/app/(dashboard)/admin/" 2>/dev/null || true
  echo "[build-ee] frontend EE pages overlaid"
fi

pnpm --filter @pinecone/backend build
pnpm --filter @pinecone/frontend build
echo "[build-ee] done (enterprise edition with overlay)"
