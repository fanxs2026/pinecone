@echo off
rem ============================================
rem Pinecone frontend dev server restarter
rem Kills any hung process on :6173 and starts a
rem fresh `next dev` (Turbopack) on port 6173.
rem Usage: double-click this file.
rem ============================================
setlocal
echo Killing process on port 6173 if any...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":6173" ^| findstr "LISTENING"') do (
  echo   killing PID %%p
  taskkill /PID %%p /F >nul 2>&1
)
cd /d "D:\Workspace\project\Pinecone\apps\frontend"
start "pinecone-frontend" cmd /k "npx next dev --port 6173"
echo.
echo Frontend restarted: http://localhost:6173
echo Keep this window open to see dev server logs.
endlocal
