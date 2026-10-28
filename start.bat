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

:: Завершаем только предыдущие процессы Node.js, не трогая Docker и системные службы
taskkill /f /im node.exe >nul 2>&1

echo Starting Stockeasy on http://localhost:3005
echo Do not close this window while using the app.
echo.

start "" cmd /c "timeout /t 2 >nul && start http://localhost:3005"

:: 1. Порт приложения
set PORT=3005

:: 2. База данных PostgreSQL (авто-определение: Docker на 5433 или Windows-служба на 5432)
netstat -ano | findstr /C:":5433 " | findstr "LISTENING" >nul 2>&1
if %errorlevel% equ 0 (
    echo [DB] Обнаружен Docker-контейнер PostgreSQL на порту 5433
    set PGPORT=5433
    set PGPASSWORD=M9L4E22DPU4sUrU3tAnN
    set DATABASE_URL=postgres://postgres:M9L4E22DPU4sUrU3tAnN@localhost:5433/stockeasy_db
) else (
    echo [DB] Подключение к локальной службе PostgreSQL на порту 5432...
    set PGPORT=5432
    set PGPASSWORD=postgres
    set DATABASE_URL=postgres://postgres:postgres@localhost:5432/stockeasy_db
)
set DADATA_API_KEY=5312de9ffa05f9a68cc381ddbb8484385f032bd8
set DADATA_SECRET_KEY=710ce98120d857761c5d1843eac9c04fa6944ee7
set JWT_SECRET=stockeasy_production_secure_jwt_secret_key_2026_q89w4e7r5t2y1u6i

:: 3. Настройка ИИ-ассистента Стоки (DeepSeek Cloud API)
if "%AI_BASE_URL%"=="" set AI_BASE_URL=https://api.deepseek.com/v1
if "%AI_MODEL%"=="" set AI_MODEL=deepseek-chat

if exist ".env" (
    echo [ENV] Загрузка переменных окружения из .env
    node --env-file=.env server/index.js
) else (
    node server/index.js
)

pause
