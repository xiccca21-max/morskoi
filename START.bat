@echo off
chcp 65001 >nul
title Naval Clash
cd /d "%~dp0"

echo.
echo  ==========================================
echo   NAVAL CLASH - ЗАПУСК
echo  ==========================================
echo.

:: Backend
echo [1/2] Backend...
start "Naval Backend" /MIN cmd /c "cd /d %~dp0backend && npm run start:dev"
timeout /t 10 /nobreak >nul

:: Tunnel (localhost.run - без IP-страницы, стабильнее localtunnel)
echo [2/2] Tunnel...
echo.
start "Naval Tunnel" cmd /k "ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -R 80:localhost:4000 nokey@localhost.run"

timeout /t 8 /nobreak >nul
echo.
echo  ==========================================
echo   ГОТОВО!
echo  ==========================================
echo.
echo  1. Открой окно "Naval Tunnel"
echo  2. Скопируй URL вида https://xxxxx.lhr.life
echo  3. BotFather - Menu Button URL - вставь его
echo  4. Title кнопки: Play
echo  5. Открой бота в Telegram
echo.
echo  НЕ ЗАКРЫВАЙ окна Backend и Tunnel!
echo.
pause
