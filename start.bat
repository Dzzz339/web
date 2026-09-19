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

:: 2. База данных на порту 5433 и сервисы Dadata
set PGPORT=5433
set PGPASSWORD=M9L4E22DPU4sUrU3tAnN
set DATABASE_URL=postgres://postgres:M9L4E22DPU4sUrU3tAnN@localhost:5433/stockeasy_db
set DADATA_API_KEY=5312de9ffa05f9a68cc381ddbb8484385f032bd8
set DADATA_SECRET_KEY=710ce98120d857761c5d1843eac9c04fa6944ee7
set AI_MODEL=qwen-cpu:latest
set AI_BASE_URL=http://127.0.0.1:11434/v1
set OLLAMA_NUM_GPU=0
set CUDA_VISIBLE_DEVICES=
:: Опционально для отправки реальных email через Resend:
:: set RESEND_API_KEY=re_your_api_key

node server/index.js

pause
