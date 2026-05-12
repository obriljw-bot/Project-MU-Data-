@echo off
chcp 65001
echo ==========================================
echo   Grip Live Broadcasting Helper System
echo   (Backend + Frontend + Sniffer)
echo ==========================================
echo.
echo 1. Starting Backend Server...
start "Grip Backend" cmd /k "cd /d .\web-app && npm run server"

echo 2. Starting Frontend Dashboard (Original)...
start "Grip Dashboard" cmd /k "cd /d ".\Auto Brodcasting Helper\frontend" && npm run dev"
timeout /t 5
start http://localhost:5173

echo 3. Starting Network Sniffer...
start "Grip Sniffer" cmd /k "cd /d ".\Auto Brodcasting Helper" && node signal_sniffer_v3.js"

echo.
echo ✅ All systems started! You can minimize these windows.
echo.
pause
