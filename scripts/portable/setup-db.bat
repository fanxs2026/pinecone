@echo off
setlocal
cd /d "%~dp0"
title Pinecone - database setup

if not exist "node\node.exe" (
  echo ERROR: node\node.exe is missing. The package is incomplete.
  pause
  exit /b 1
)

if not exist ".env" (
  if exist ".env.example" (
    copy /y ".env.example" ".env" >nul
    echo Created .env from template.
  ) else (
    echo ERROR: .env and .env.example are both missing.
    pause
    exit /b 1
  )
)

if not exist "db\schema.sql" (
  echo ERROR: db\schema.sql is missing. The package is incomplete.
  pause
  exit /b 1
)

echo.
echo This will create the database roles, the database and all tables,
echo then write the credentials into .env.
echo.
echo You need the PostgreSQL superuser name and password
echo (the one chosen when PostgreSQL was installed).
echo.

"node\node.exe" "bin\setup-db.js" %*

echo.
echo Finished. If there were errors above, nothing was committed.
pause
