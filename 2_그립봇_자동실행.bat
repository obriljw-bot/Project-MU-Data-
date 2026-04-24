@echo off
chcp 65001 >nul
title 📱 무선 스캐너 모바일 접속 주소 확인창 (그립봇 런처)
cls

echo ========================================================
echo         G R I P   A U T O M A T I O N   B O T
echo         --- Automated Launcher System V4.4 ---
echo ========================================================
echo.

:: Get Local IP Address using PowerShell
for /f "usebackq tokens=*" %%i in (`powershell -Command "(Get-NetIPAddress -AddressFamily IPv4 ^| Where-Object { $_.InterfaceAlias -notmatch 'Loopback^|vEthernet^|Virtual^|WSL^|Bluetooth' -and $_.IPAddress -like '*.*.*.*' }).IPAddress ^| Select-Object -First 1"`) do set LOCAL_IP=%%i

echo ========================================================
echo 📱 [스마트폰 무선 스캐너 접속 안내]
echo 👉 http://%LOCAL_IP%:5173/scanner.html
echo.
echo 💡 [폰에서 카메라 권한 오류 시 해결방법 (최초 1회)]
echo 1. 스마트폰 크롬(Chrome) 주소창에 아래 주소 접속:
echo    chrome://flags/#unsafely-treat-insecure-origin-as-secure
echo 2. 나타나는 빈칸에 스캐너 주소(http://%LOCAL_IP%:5173) 입력
echo 3. 버튼을 'Enabled'로 변경 후 우측 하단 'Relaunch' 클릭
echo ========================================================
echo.

set "PROJECT_ROOT=c:\OneBridge\apps-script\data\Project-MU-Data-"

echo [1/3] Starting Backend Server...
cd /d "%PROJECT_ROOT%\web-app"
start "Grip Backend" cmd /c "npm run server"

echo [2/3] Starting Frontend Dashboard...
cd /d "%PROJECT_ROOT%\Auto Brodcasting Helper\frontend"
start "Grip Dashboard" cmd /c "npm run dev"

echo [WAIT] Loading Browser in 3 seconds...
timeout /t 3 >nul
start http://localhost:5173
echo [3/3] Starting Network Sniffer...
cd /d "%PROJECT_ROOT%\Auto Brodcasting Helper"
start "Grip Sniffer" cmd /k "node signal_sniffer_v3.js"

echo.

echo.
echo ========================================================
echo [ OK ] All systems started successfully!
echo Please DO NOT close the background terminal windows.
echo You can minimize them.
echo ========================================================
echo.
pause
