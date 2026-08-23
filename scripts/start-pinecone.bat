@echo off
setlocal enabledelayedexpansion
REM Pinecone Docker startup script
REM Usage: double-click after Docker Desktop is running (whale icon green)
REM Steps: wait for Docker engine -> start containers -> open browser

echo [1/3] Waiting for Docker engine...
docker info >nul 2>&1
if errorlevel 1 (
  echo Docker engine not ready. Waiting up to 60s...
  set /a n=0
  :wait_loop
  timeout /t 5 /nobreak >nul
  docker info >nul 2>&1
  if errorlevel 1 (
    set /a n+=1
    if !n! LSS 12 goto wait_loop
    echo ERROR: Docker engine did not start. Please start Docker Desktop first.
    pause
    exit /b 1
  )
)
echo Docker engine ready.

echo [2/3] Starting Pinecone containers...
cd /d "%~dp0"
docker compose -f docker-compose.local.yml up -d
if errorlevel 1 (
  echo ERROR: Failed to start containers.
  pause
  exit /b 1
)

echo [3/3] Opening Pinecone...
timeout /t 3 /nobreak >nul
start "" "http://localhost:6173"
echo Done. Pinecone is running at http://localhost:6173
