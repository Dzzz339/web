@echo off
title Stockeasy (Демо-версия)

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo Node.js not found!
    echo Please install Node.js from https://nodejs.org
    pause
    exit
)

echo ===================================================
echo     Запуск изолированной ДЕМО-среды StockEasy
echo     (Боевая база данных НЕ затрагивается!)
echo ===================================================
echo.

:: 1. Порт демо-приложения
set PORT=3006

:: 2. База данных DEMO (порт 5432)
set PGPORT=5432
set PGPASSWORD=postgres
set DATABASE_URL=postgres://postgres:postgres@localhost:5432/stockeasy_demo
set DADATA_API_KEY=5312de9ffa05f9a68cc381ddbb8484385f032bd8
set DADATA_SECRET_KEY=710ce98120d857761c5d1843eac9c04fa6944ee7

:: 3. Автоматический сидинг чистой демо-базы
echo Подготовка и проверка демо-базы данных...
node server/scripts/seed-demo.js

start "" cmd /c "timeout /t 2 >nul && start http://localhost:3006"

echo Запуск демо-сервера на http://localhost:3006 ...
node server/index.js

pause
