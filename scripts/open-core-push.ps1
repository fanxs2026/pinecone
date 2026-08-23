# Pinecone Open Core - local only: purge EE history + force-push (PowerShell)
# Run from repo root in PowerShell (Windows). Do NOT run in sandbox/CI.
$ErrorActionPreference = "Stop"

$REPO_ROOT = (Get-Location).Path
Write-Host "[0] Repo root: $REPO_ROOT"

# ---- Step 1: locate git-filter-repo.exe (standalone, NOT as git subcommand) ----
# Git for Windows won't find it on PATH as a subcommand; we call the .exe directly.
$PY_DIR = "C:\Users\Xuesong.Fan\.workbuddy\binaries\python\versions\3.13.12"
$FILTER_REPO_EXE = Join-Path $PY_DIR "Scripts\git-filter-repo.exe"
if (-not (Test-Path $FILTER_REPO_EXE)) {
    Write-Host "[0] git-filter-repo.exe not found. Installing via pinned Python..."
    $PY = Join-Path $PY_DIR "python.exe"
    if (-not (Test-Path $PY)) { Write-Host "ERROR: pinned Python missing at $PY"; exit 1 }
    & $PY -m pip install --user git-filter-repo 2>&1 | Out-Host
}
if (-not (Test-Path $FILTER_REPO_EXE)) {
    Write-Host "ERROR: install failed. Manual: place git-filter-repo.exe under $PY_DIR\Scripts"
    exit 1
}
Write-Host "[0] git-filter-repo ready: $FILTER_REPO_EXE"

# ---- Step 2: backup check ----
Write-Host "[1/7] Backup dirs check (rollback safety)"
foreach ($b in @(".git.bak",".git.before-overlay-rewrite",".git.before-rewrite")) {
    if (Test-Path $b) { Write-Host "  ok: $b" }
    else { Write-Host "  WARN: missing $b (recommend: cp -r .git $b)" }
}

# ---- Step 3: branch + cleanliness check ----
Write-Host "[2/7] Current branch & working tree"
$br = (git branch --show-current)
Write-Host "  branch: $br"
if ($br -ne "main") {
    Write-Host "ERROR: not on 'main'. Checkout main first."
    exit 1
}
$status = (git status --porcelain)
if ($status) {
    Write-Host "ERROR: working tree not clean. Commit or stash first:"
    Write-Host $status
    exit 1
} else {
    Write-Host "  ok: working tree clean"
}

# ---- Step 4: filter-repo purge ----
Write-Host "[3/7] git-filter-repo --invert-paths (purge EE from ALL history)"
& $FILTER_REPO_EXE --force --invert-paths --paths-from-file .gitignore-ee-paths.txt

# ---- Step 5: verify purge ----
Write-Host "[4/7] Verify EE paths gone from history"
$hit = git log --all --oneline -- "apps/backend/src/modules/license" "apps/backend/src/modules/sso" "apps/frontend/src/app/(dashboard)/admin/licenses" | Select-String "."
if ($hit) {
    Write-Host "  ERROR: EE paths still in history, abort!"
    $hit | ForEach-Object { Write-Host "    $_" }
    exit 1
} else {
    Write-Host "  ok: EE modules removed from all history"
}

# ---- Step 5b: filter-repo strips 'origin' by design; re-add it ----
Write-Host "[5/7] Re-add origin remote (filter-repo removed it)"
$REMOTE_URL = "git@github.com:fanxs2026/pinecone.git"
$existing = git remote get-url origin 2>$null
if (-not $existing) {
    git remote add origin $REMOTE_URL
    Write-Host "  added: $REMOTE_URL"
} else {
    Write-Host "  ok: origin already present ($existing)"
}

# ---- Step 6: fetch + force-with-lease push ----
Write-Host "[6/7] git fetch origin (refresh lease to avoid stale)"
git fetch origin
Write-Host "[7/7] force-push main (--force-with-lease)"
git push --force-with-lease origin main
Write-Host "DONE. Local main history no longer contains EE source; GitHub overwritten."

# ---- Step 7: flip-public audit (run after setting repo public) ----
Write-Host ""
Write-Host "=== [7/7] flip-public audit (run AFTER repo set to public) ==="
Write-Host "  A. In a TEMP dir, bare-clone what you just pushed:"
Write-Host "     git clone --bare https://github.com/<you>/pinecone C:\tmp\pc-audit ; cd C:\tmp\pc-audit"
Write-Host "  B. Search ALL history for EE keywords (expect ZERO hits):"
Write-Host "     git log --all --oneline -- 'apps/backend/src/modules/license' 'apps/backend/src/modules/sso' | Select-String '.' ; if none -> ok"
Write-Host "  C. Confirm no secret files ever tracked:"
Write-Host "     git log --all --diff-filter=A --name-only --pretty=format: | findstr /I /R '\\.env$ \\.pem$ \\.key$' ; if none -> ok"
Write-Host "  D. Cleanup: cd C:\ ; rmdir /s /q C:\tmp\pc-audit"
Write-Host ""
Write-Host "If B or C shows a hit, .gitignore-ee-paths.txt is missing a path; add it and re-run."
