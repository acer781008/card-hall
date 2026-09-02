@echo off
title Multiplayer Card Hall V1.0
echo ========================================
echo Multiplayer Card Hall V1.0
echo ========================================
where node >nul 2>nul
if errorlevel 1 (
 echo [ERROR] Node.js not found.
 echo Please install Node.js LTS first.
 pause
 exit /b
)
if not exist node_modules (
 echo First launch - installing packages...
 call npm install
 if errorlevel 1 (
  echo [ERROR] npm install failed.
  pause
  exit /b
 )
)
echo Admin : http://localhost:3000/admin.html
echo Player: http://localhost:3000/player.html
start "" http://localhost:3000/admin.html
npm start
pause
