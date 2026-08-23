#!/usr/bin/env bash
# Pinecone Open Core — 本机执行：清历史 + 强推 GitHub
# 前置：已 pip install git-filter-repo；且当前在 Pinecone 仓库根目录
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

echo "[1/6] 校验备份目录存在（回滚用）"
for b in .git.bak .git.before-overlay-rewrite .git.before-rewrite; do
  [ -d "$b" ] && echo "  ok: $b" || echo "  WARN: 缺少 $b（建议先 cp -r .git $b）"
done

echo "[2/6] 确认当前分支 = main"
git branch --show-current

echo "[3/6] 执行 git filter-repo 清除 EE 历史路径"
# --force 因为本仓库已 push 过（filter-repo 默认拒绝）；--invert-paths 保留【非】清单路径
git filter-repo --force --invert-paths --paths-from-file .gitignore-ee-paths.txt

echo "[4/6] 校验 EE 路径已从历史消失"
if git log --all --oneline -- "apps/backend/src/modules/license" | grep -q .; then
  echo "  ERROR: license 仍在历史，停止！"
  exit 1
else
  echo "  ok: EE 模块已从全部历史移除"
fi

echo "[5/6] 刷新远端认知（避免 --force-with-lease stale）"
git fetch origin

echo "[6/6] 强推 main（--force-with-lease，安全覆盖）"
git push --force-with-lease origin main

echo "DONE. 本地 main 历史已不含 EE 源码，GitHub 已强推覆盖。"
echo ""
echo "=== [7/7] flip public 后的复核清单（建议公开后立即执行） ==="
echo "  步骤 A：另建临时目录，裸克隆刚推上去的仓库"
echo "    git clone --bare https://github.com/<you>/pinecone /tmp/pc-audit && cd /tmp/pc-audit"
echo "  步骤 B：全历史搜索企业关键词（应零命中）"
echo "    git grep -I --all-match -e 'license' -e 'sso' -e 'scim' -e 'audit' -e 'webhook-inbound' \\"
echo "         -e 'LICENSE_PRIVATE_KEY' -- $(git rev-list --all) 2>/dev/null | grep -iE 'modules/(license|sso|scim|audit|github|webhooks|webhook-inbound|ci|api-tokens|teams|trash|ai|okr)' && echo 'FOUND!' || echo '  ok: 历史无 EE 源码'"
echo "  步骤 C：抽查几个老 commit 是否还能看到 EE 文件"
echo "    git log --all --oneline -- 'apps/backend/src/modules/license' | grep -q . && echo 'FOUND!' || echo '  ok: license 路径在所有历史 commit 中均不存在'"
echo "  步骤 D：确认无 .env / 私钥曾被跟踪"
echo "    git log --all --diff-filter=A --name-only --pretty=format: | grep -iE '\\.env$|\\.pem$|\\.key$' && echo 'FOUND SECRET!' || echo '  ok: 无密钥文件入过历史'"
echo "  步骤 E：清理临时目录"
echo "    cd / && rm -rf /tmp/pc-audit"
echo ""
echo "若步骤 B/C/D 任一报 FOUND，说明 filter-repo 路径清单有遗漏，需补 .gitignore-ee-paths.txt 重跑本脚本。"
