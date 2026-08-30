@echo off
cd /d "%~dp0frontend"
echo ========================================================
echo Auto Broadcasting Helper - Frontend (Vite) Server
echo Running from: %cd%
echo ========================================================
call npm run dev
echo.
echo Server stopped.
pause
