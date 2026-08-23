@echo off
title Pinecone Verify (install + typecheck + test + build)
cd /d "%~dp0.."

echo ============================================
echo  [1/5] pnpm install
echo ============================================
call pnpm install
if errorlevel 1 goto :fail

echo.
echo ============================================
echo  [2/5] backend typecheck
echo ============================================
call pnpm --filter backend typecheck
if errorlevel 1 goto :fail

echo.
echo ============================================
echo  [3/5] backend test
echo ============================================
call pnpm --filter backend test
if errorlevel 1 goto :fail

echo.
echo ============================================
echo  [4/5] backend build
echo ============================================
call pnpm --filter backend build
if errorlevel 1 goto :fail

echo.
echo ============================================
echo  [5/5] frontend build
echo ============================================
set NEXT_PUBLIC_API_URL=http://localhost:3000/api
call pnpm --filter frontend build
if errorlevel 1 goto :fail

echo.
echo ============================================
echo  [PASS] install/typecheck/test/build all ok
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
