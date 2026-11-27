@echo off
title Pinecone Verify (typecheck + schema + test + consistent build)
cd /d "%~dp0.."

echo ============================================
echo  [1/7] pnpm install
echo ============================================
call pnpm install
if errorlevel 1 goto :fail

echo.
echo ============================================
echo  [2/7] backend typecheck
echo ============================================
call pnpm --filter backend typecheck
if errorlevel 1 goto :fail

echo.
echo ============================================
echo  [3/7] portable schema snapshot check
echo     (db/schema.sql must cover prisma/schema.prisma)
echo ============================================
call node scripts\verify-portable-schema.js
if errorlevel 1 goto :fail

echo.
echo ============================================
echo  [4/7] database schema check (dev DB vs prisma)
echo ============================================
call node scripts\verify-db-schema.js
if errorlevel 1 goto :fail

echo.
echo ============================================
echo  [5/7] backend test
echo ============================================
call pnpm --filter backend test
if errorlevel 1 goto :fail

echo.
echo ============================================
echo  [6/7] backend build
echo ============================================
call pnpm --filter backend build
if errorlevel 1 goto :fail

echo.
echo ============================================
echo  [7/7] frontend build (runtime URL resolution)
echo ============================================
REM Do NOT set NEXT_PUBLIC_API_URL here. cmd's "set VAR=" deletes the variable,
REM and Next would then read apps/frontend/.env.local (localhost) back into the
REM bundle. The shared script sets them to empty strings from the Node layer,
REM which is exactly what pack-portable does - so both produce the same artifact.
call node scripts\build-frontend-pack.js
if errorlevel 1 goto :fail

echo.
echo ============================================
echo  [PASS] typecheck/schema/test/build all ok
echo ============================================
pause
exit /b 0

:fail
echo.
echo ============================================
echo  [FAIL] see output above for errors
echo ============================================
pause
exit /b 1
