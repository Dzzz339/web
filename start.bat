@echo off
title Stockeasy

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo Node.js not found!
    echo Please install Node.js from https://nodejs.org
    echo Download the LTS version and run this file again.
    pause
    start https://nodejs.org
    exit
)

if not exist "node_modules" (
    echo Installing dependencies, please wait...
    call npm install
    if %errorlevel% neq 0 (
        echo npm install failed!
        pause
        exit
    )
    echo Done!
)

:: Kill any process already using port 3000
for /f "tokens=5" %%a in ('netstat -aon ^| find ":3000" ^| find "LISTENING"') do (
    taskkill /f /pid %%a >nul 2>&1
)

echo Starting Stockeasy on http://localhost:3000
echo Do not close this window while using the app.
echo.

start "" cmd /c "timeout /t 2 >nul && start http://localhost:3000"

set DATABASE_URL=postgres://postgres@localhost:5432/stockeasy_db
node server/index.js

pause
