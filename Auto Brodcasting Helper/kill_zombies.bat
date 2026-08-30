@echo off
echo ========================================================
echo [Grip Automation] Killing Zombie Processes...
echo ========================================================
taskkill /F /IM node.exe
taskkill /F /IM chromium.exe
taskkill /F /IM play.exe
taskkill /F /IM cloudflared.exe
echo.
echo All Node.js and Browser processes have been terminated.
echo You can now restart start_grip_system.bat safely.
echo ========================================================
pause
