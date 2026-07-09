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
set DADATA_API_KEY=5312de9ffa05f9a68cc381ddbb8484385f032bd8
set DADATA_SECRET_KEY=710ce98120d857761c5d1843eac9c04fa6944ee7
node server/index.js

pause
