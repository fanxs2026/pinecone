@echo off
REM Pinecone Docker stop script
REM Usage: double-click to stop containers (data preserved, uploads kept)

echo Stopping Pinecone containers...
cd /d "%~dp0"
docker compose -f docker-compose.local.yml down
if errorlevel 1 (
  echo ERROR: Failed to stop containers.
  pause
  exit /b 1
)
echo Done. Pinecone containers stopped. Data is preserved.
pause
