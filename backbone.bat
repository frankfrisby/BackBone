@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul 2>&1

title BACKBONE ENGINE
reg add HKCU\Console /v VirtualTerminalLevel /t REG_DWORD /d 1 /f >nul 2>&1
cd /d "%~dp0"

REM Prevent server from also launching a browser (we handle it here)
set BACKBONE_NO_BROWSER=1

REM Check if server is already running
curl -s --connect-timeout 2 http://localhost:3000/health >nul 2>&1
if not errorlevel 1 (
  echo [BACKBONE] Server already running on port 3000
  goto launchpwa
)

REM Start server silently in a hidden window
echo [BACKBONE] Starting server...
start "BACKBONE Server" /MIN node src/server.js

REM Wait for server to be ready (up to 15 seconds)
set /a tries=0
:waitserver
set /a tries+=1
if %tries% gtr 15 (
  echo [BACKBONE] Server took too long, continuing anyway...
  goto launchpwa
)
timeout /t 1 /nobreak >nul
curl -s --connect-timeout 1 http://localhost:3000/health >nul 2>&1
if errorlevel 1 goto waitserver
echo [BACKBONE] Server ready

:launchpwa
REM PWA dormant — server runs but no browser window opened
REM Access manually at http://localhost:3000/app if needed

REM Start the CLI (foreground — this is the main terminal UI)
:startbb
node bin/backbone.js %*

if exist "_restart_signal" (
  del "_restart_signal" >nul 2>&1
  echo [BACKBONE] Update applied, restarting...
  timeout /t 1 /nobreak >nul
  goto startbb
)

if errorlevel 1 (
  echo.
  echo   [ERROR] BACKBONE exited with error code %errorlevel%
  echo.
  pause
)
