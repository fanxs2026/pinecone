# Pinecone Open Core — 净化 + 安全推送 runbook (PowerShell, Windows)
# 目标：把企业版(EE)历史、旧 .git 备份、设计文档从公开仓库彻底清除后，只推社区版到 GitHub。
#
# 前置（务必先手动完成）：
#   1) 备份当前 .git：  cp -r .git .git.bak
#   2) 当前在 main 分支，且工作树干净（或仅含你已知、准备提交的文档改动）
#   3) 已审阅 .gitignore-ee-paths.txt（含 EE 模块 + 设计文档 + .git.before-rewrite）
#
# 危险：本脚本会【改写公开仓库历史】并 force-push。仅在本机、已审阅、已备份后执行。
# 数据安全：设计文档与旧 .git 备份会先复制到仓库【外】的本地目录，净化后本地副本仍在。

$ErrorActionPreference = "Stop"
$REPO = (Get-Location).Path
Write-Host "[0] Repo root: $REPO"

# ---- 0) 安全前置检查 ----
$br = git branch --show-current
if ($br -ne "main") { Write-Host "ERROR: 不在 main 分支（当前 $br）"; exit 1 }
$st = git status --porcelain
if ($st) { Write-Host "ERROR: 工作树不干净，请先 commit / stash：`n$st"; exit 1 }
Write-Host "  ok: 在 main 且工作树干净"

# ---- 1) 本地保留设计文档（复制到仓库外，永不推送） ----
$DOCBK = "..\pinecone-docs-local"
if (-not (Test-Path $DOCBK)) { New-Item -ItemType Directory -Path $DOCBK | Out-Null }
if (Test-Path "deliverables/design-docs") {
  robocopy "deliverables/design-docs" "$DOCBK/design-docs" /E /NFL /NDL /NJH /NJS | Out-Null
  Write-Host "[1] 设计文档已备份到 $DOCBK/design-docs"
}
foreach ($f in @("STATUS_COLORS_DESIGN.md","deliverables/edition-isolation-plan-1.0.0.md","deliverables/sso-enterprise-guide-1.0.0.md")) {
  if (Test-Path $f) { Copy-Item $f -Destination "$DOCBK/$(Split-Path $f -Leaf)" -Force; Write-Host "[1] 备份 $f" }
}

# ---- 2) 本地保留旧 .git 备份（移出仓库，避免被 filter-repo 清掉且永不推送） ----
if (Test-Path ".git.before-rewrite") {
  Move-Item ".git.before-rewrite" "..\pinecone-git-backup-pre-opencore" -Force
  Write-Host "[2] 旧 .git 备份已移出仓库 -> ..\pinecone-git-backup-pre-opencore"
}

# ---- 3) 从仓库索引移除设计文档 + 旧备份（本地副本已在上两步保留） ----
$staged = $false
git rm -r --ignore-unmatch --quiet deliverables/design-docs STATUS_COLORS_DESIGN.md deliverables/edition-isolation-plan-1.0.0.md deliverables/sso-enterprise-guide-1.0.0.md 2>$null
git rm --cached -r --ignore-unmatch --quiet .git.before-rewrite 2>$null
if (git diff --cached --name-only | Select-String ".") {
  git commit -m "chore(open-core): stop tracking design docs and pre-rewrite git backup (local-only)" | Out-Host
  Write-Host "[3] 已从索引移除设计文档/旧备份并提交（本地副本在仓库外保留）"
} else {
  Write-Host "[3] 索引中无相关条目，跳过提交"
}

# ---- 4) filter-repo：从【全部历史】清除 EE 模块 + 设计文档 + 旧备份路径 ----
$FILTER = "C:\Users\Xuesong.Fan\.workbuddy\binaries\python\versions\3.13.12\Scripts\git-filter-repo.exe"
if (-not (Test-Path $FILTER)) { Write-Host "ERROR: git-filter-repo.exe 缺失，请先安装"; exit 1 }
& $FILTER --force --invert-paths --paths-from-file .gitignore-ee-paths.txt
Write-Host "[4] filter-repo 完成：EE / 设计文档 / 旧备份已从全部历史清除"

# ---- 5) 重新关联 origin 并强推（filter-repo 会摘除 remote） ----
git remote remove origin 2>$null
git remote add origin "git@github.com:fanxs2026/pinecone.git"
git fetch origin
git push --force-with-lease origin main
Write-Host "[5] 强推完成；GitHub 历史已重写"

# ---- 6) 验证：裸克隆公开仓库，扫描全部历史应无残留 ----
$TMP = "C:\tmp\pc-audit-$(Get-Date -Format yyyyMMddHHmmss)"
git clone --bare https://github.com/fanxs2026/pinecone.git $TMP 2>$null
$hit = git --git-dir=$TMP log --all --oneline -- 'deliverables/design-docs' 'STATUS_COLORS_DESIGN.md' '.git.before-rewrite' 'apps/backend/src/modules/license' 'apps/backend/src/modules/sso' | Select-String "."
if ($hit) {
  Write-Host "ERROR: 验证发现历史残留："
  $hit | ForEach-Object { Write-Host "  $_" }
} else {
  Write-Host "[6] 验证通过：公开历史无设计文档 / 旧备份 / EE 源码"
}
Remove-Item $TMP -Recurse -Force 2>$null

Write-Host ""
Write-Host "=== 后续必做：密钥轮换（安全事件） ==="
Write-Host "  .git.before-rewrite 曾公开在 GitHub，内含抽取前旧 .git，可能携带旧 .env"
Write-Host "  （DB 密码 GEx710529hc / JWT_ACCESS_SECRET / JWT_REFRESH_SECRET / PINE_LICENSE_KEY 等）。"
Write-Host "  立即轮换：PostgreSQL 密码、JWT 双密钥、企业版 License 密钥；并核对 CI Repository secrets。"
