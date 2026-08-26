#!/usr/bin/env bash
# ============================================================================
# Pinecone 发布：按版本（社区版 ce / 企业版 ee）构建不可变 tag 镜像，
# 导出离线分发包，并打包成「一键发布单包」zip。
#
# 用法（仓库根目录，Git Bash）：
#   scripts/release-images.sh <version> <edition> [overlay-path]
#     <version>   语义版本，如 v1.0.0
#     <edition>   ce | ee  （亦可写 community | enterprise）
#     [overlay]   仅 ee 需要：pinecone-overlay 仓库根（默认 ../pinecone-overlay）
#
# 设计要点：
#   - 同一份 docker/backend.Dockerfile、docker/frontend.Dockerfile 服务两版；
#     通过 --build-arg EDITION 与 BuildKit 外部构建上下文 eeoverlay 区分。
#   - 社区版：eeoverlay 传一个【仅含空目录】的 scaffold，COPY 源存在但为空 -> GUARD 跳过，
#     编译产物不含任何企业代码（零泄露，符合 AGPL 社区版）。
#   - 企业版：eeoverlay 传 pinecone-overlay 仓库根，编译产物包含企业模块；
#     生产镜像内将 node_modules/@ee 软链到 dist/modules，使 ee-gate 的
#     import('@ee/...') 在 CJS 运行时可解析。
#
# 产物（dist/）：
#   pinecone-<ed>-backend-<version>-<sha>.tar
#   pinecone-<ed>-frontend-<version>-<sha>.tar
#   pinecone-<ed>-release-<version>-<sha>.zip   （单文件发布包，开箱即用）
#
# 发布包内含：两个镜像 tar + docker-compose.<ed>.yml + docker/.env.<ed>.example
#   + docker/postgres/init-v2 + load-and-run.sh + README.md
#   +（仅企业版）EULA.txt
#
# 部署：解压后 bash load-and-run.sh 即可加载镜像并启动；
#   或 docker load < dist/...tar 后用对应 compose 启动：
#   PINE_IMAGE_TAG=<version>-<sha> docker compose -f docker-compose.<ed>.yml \
#     --env-file docker/.env.<ed> up -d
# 回滚：load 上一版 tar 并以旧 tag 重启。
# ============================================================================
set -euo pipefail

if [ $# -lt 2 ]; then
  echo "usage: $0 <version> <edition:ce|ee> [overlay-path]" >&2
  exit 1
fi

VERSION="$1"
EDITION_RAW="$(echo "$2" | tr '[:upper:]' '[:lower:]')"
OVERLAY="${3:-../pinecone-overlay}"

case "$EDITION_RAW" in
  ce|community)  EDITION=community; ED=ce ;;
  ee|enterprise) EDITION=enterprise; ED=ee ;;
  *) echo "ERROR: unknown edition '$2' (use ce|ee)" >&2; exit 1 ;;
esac

COMMIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
TAG="${VERSION}-${COMMIT_SHA}"
mkdir -p dist

# ── 准备 eeoverlay 构建上下文 ──
EEOVERLAY=""
CLEANUP_EEOVERLAY=0
if [ "$EDITION" = "enterprise" ]; then
  if [ ! -d "$OVERLAY/backend/modules/ee" ]; then
    echo "ERROR: enterprise overlay not found at $OVERLAY (need backend/modules/ee)" >&2
    exit 1
  fi
  EEOVERLAY="$OVERLAY"
else
  # 社区版：造一个仅含空目录的 scaffold，使 Dockerfile 的 COPY 源路径存在但为空
  EEOVERLAY="$(mktemp -d)"
  CLEANUP_EEOVERLAY=1
  mkdir -p "$EEOVERLAY/backend/modules/ee" "$EEOVERLAY/frontend/admin/ee"
fi

cleanup() { [ "$CLEANUP_EEOVERLAY" = "1" ] && [ -n "$EEOVERLAY" ] && rm -rf "$EEOVERLAY"; }
trap cleanup EXIT

echo "==> Edition: $EDITION (ed=$ED)  Tag: $TAG"

build_and_save() {
  local svc="$1"   # backend | frontend
  local dockerfile="docker/${svc}.Dockerfile"
  local img="pinecone-${ED}-${svc}"
  echo "==> Building ${img}:${TAG} (commit ${COMMIT_SHA})"
  docker buildx build --load \
    --build-arg "COMMIT_SHA=${COMMIT_SHA}" \
    --build-arg "EDITION=${EDITION}" \
    --build-context "eeoverlay=${EEOVERLAY}" \
    -t "${img}:${TAG}" \
    -t "${img}:latest" \
    -f "$dockerfile" .
  echo "==> Saving dist/${img}-${TAG}.tar"
  docker save -o "dist/${img}-${TAG}.tar" "${img}:${TAG}"
}

package_bundle() {
  echo "==> Packaging turnkey release bundle"
  local stage
  stage="$(mktemp -d)"
  local backend_tar="dist/pinecone-${ED}-backend-${TAG}.tar"
  local frontend_tar="dist/pinecone-${ED}-frontend-${TAG}.tar"
  local release_zip="dist/pinecone-${ED}-release-${TAG}.zip"

  cp "$backend_tar" "$stage/"
  cp "$frontend_tar" "$stage/"
  cp "docker-compose.${ED}.yml" "$stage/"
  cp "docker/.env.${ED}.example" "$stage/.env.${ED}.example"
  mkdir -p "$stage/docker/postgres"
  cp -r "docker/postgres/init-v2" "$stage/docker/postgres/init-v2"

  # load-and-run.sh（引号 heredoc 防止当场展开，再用 sed 注入版本/版次）
  cat > "$stage/load-and-run.sh" <<'EOS'
#!/usr/bin/env bash
set -euo pipefail
TAG="__TAG__"
ED="__ED__"
DIR="$(cd "$(dirname "$0")" && pwd)"

echo "==> Loading Docker images"
docker load < "$DIR/pinecone-${ED}-backend-${TAG}.tar"
docker load < "$DIR/pinecone-${ED}-frontend-${TAG}.tar"

if [ ! -f "$DIR/.env.${ED}" ]; then
  cp "$DIR/.env.${ED}.example" "$DIR/.env.${ED}"
  echo "Generated .env.${ED}; edit DB_PASSWORD / APP_DB_PASSWORD / JWT_*_SECRET, then re-run this script."
  exit 0
fi

echo "==> Starting Pinecone ${ED} (PINE_IMAGE_TAG=${TAG})"
PINE_IMAGE_TAG="${TAG}" docker compose -f "$DIR/docker-compose.${ED}.yml" --env-file "$DIR/.env.${ED}" up -d
echo "Frontend: http://localhost:6173   API: http://localhost:3000/api"
EOS
  sed -i "s/__TAG__/${TAG}/g; s/__ED__/${ED}/g" "$stage/load-and-run.sh"

  # README.md
  cat > "$stage/README.md" <<EOS
# Pinecone ${EDITION} ${VERSION} release bundle

This single-file package contains everything needed to run Pinecone ${EDITION}:

- pinecone-${ED}-backend-${TAG}.tar    backend image
- pinecone-${ED}-frontend-${TAG}.tar   frontend image
- docker-compose.${ED}.yml             orchestration
- docker/postgres/init-v2/             postgres init scripts
- .env.${ED}.example                   env template
- load-and-run.sh                      load & start
EOS
  if [ "$EDITION" = "enterprise" ]; then
    cat >> "$stage/README.md" <<'EOS'

NOTE: This Enterprise Edition package is licensed under a separate commercial
EULA (see EULA.txt). It must not be published on a public source-code repository.
EOS
  fi
  cat >> "$stage/README.md" <<EOS

## Quick start
1. Install Docker + docker compose plugin
2. Run:  bash load-and-run.sh
   - First run creates .env.${ED}; fill in strong secrets, then run again.
3. Open http://localhost:6173

## Rollback
Re-load the previous tar and restart with the previous TAG.
EOS

  # EULA（仅企业版）
  if [ "$EDITION" = "enterprise" ]; then
    cat > "$stage/EULA.txt" <<'EOS'
PINECONE ENTERPRISE EDITION — END USER LICENSE AGREEMENT

This software (the "Software") is licensed, not sold, to the authorized
customer identified in the corresponding commercial order. Use of the Software
is permitted only under the terms of a separate, signed commercial license
agreement between you and the licensor.

1. GRANT. Subject to payment and this Agreement, you may use the Software for
   your internal business operations, for the number of seats / term stated in
   your order.
2. RESTRICTIONS. You shall not: (a) redistribute, sublicense, or make the
   Software available to third parties; (b) reverse engineer, decompile, or
   disassemble the Software except as permitted by applicable law; (c) remove
   or obscure any license or proprietary notices.
3. NO OPEN-SOURCE GRANT. This Enterprise Edition is proprietary. It is NOT
   licensed under AGPL-3.0 or any other open-source license.
4. TERMINATION. Any breach of this Agreement terminates your license
   immediately, and you must cease all use and destroy all copies.

This is a template. Replace with your counsel-reviewed legal terms before
distribution.
EOS
  fi

  # 打包为 zip（仓库根 dist/ 下）
  if command -v zip >/dev/null 2>&1; then
    ( cd "$stage" && zip -r -q -y "$release_zip" . )
  else
    # 无 zip 时回退到 PowerShell；注意路径要转成 Windows 风格，否则 Compress-Archive 找不到
    local winstage winzip
    winstage="$(cygpath -w "$stage")"
    winzip="$(cygpath -w "$PWD/$release_zip")"
    powershell -NoProfile -Command "Compress-Archive -Path '${winstage}\*' -DestinationPath '${winzip}' -Force"
  fi
  rm -rf "$stage"
  echo "==> Bundle: $release_zip"
}

build_and_save backend
build_and_save frontend
package_bundle

echo ""
echo "==> Done. Immutable tag: ${TAG}"
echo "    Load:  docker load < dist/pinecone-${ED}-backend-${TAG}.tar"
echo "          docker load < dist/pinecone-${ED}-frontend-${TAG}.tar"
echo "    Bundle: dist/pinecone-${ED}-release-${TAG}.zip"
echo "    Deploy: PINE_IMAGE_TAG=${TAG} docker compose -f docker-compose.${ED}.yml --env-file docker/.env.${ED} up -d"
echo "    Rollback: load previous dist/pinecone-${ED}-*-<prev-sha>.tar and restart with previous TAG."
