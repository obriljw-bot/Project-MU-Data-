@echo off
cd /d "%~dp0"
echo ========================================================
echo Auto Broadcasting Helper - Backend Server
echo Running from: %cd%
echo ========================================================
node backend\index.js
echo.
echo Server stopped.
pause
