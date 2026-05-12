@echo off
chcp 65001 >nul
cls

echo ========================================================
echo       [ G R I P    A U T O M A T I O N ]
echo       --- Process Cleanup Utility ---
echo ========================================================
echo.
echo Closing zombie background bots...
taskkill /f /im node.exe /t >nul 2>&1
taskkill /f /im ngrok.exe /t >nul 2>&1
taskkill /f /im cloudflared* /t >nul 2>&1
taskkill /F /IM play.exe >nul 2>&1
echo.
echo [ OK ] All background processes terminated successfully.
echo [ NEXT ] You can now launch the '2_Start_GripBot.bat'.
echo.
echo ========================================================
pause
