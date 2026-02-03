@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul 2>&1

:: BACKBONE Engine Launcher

:: ── Singleton check: exit if already running ──
if exist "%~dp0data\.backbone.lock" (
  for /f "tokens=2 delims=:," %%a in ('type "%~dp0data\.backbone.lock" 2^>nul ^| findstr "pid"') do (
    set "LOCK_PID=%%~a"
  )
  if defined LOCK_PID (
    set "LOCK_PID=!LOCK_PID: =!"
    tasklist /FI "PID eq !LOCK_PID!" 2>nul | findstr /i "node" >nul 2>&1
    if not errorlevel 1 (
      exit
    )
  )
)
tasklist /FI "WINDOWTITLE eq BACKBONE ENGINE" 2>nul | findstr /i "cmd" >nul 2>&1
if not errorlevel 1 (
  exit
)

title BACKBONE ENGINE

:: Enable ANSI escape sequences
reg add HKCU\Console /v VirtualTerminalLevel /t REG_DWORD /d 1 /f >nul 2>&1

:: Change to script directory
cd /d "%~dp0"

:: Run BACKBONE
node bin/backbone.js

:: Handle errors
if errorlevel 1 (
    echo.
    echo   [ERROR] BACKBONE exited with error
    echo.
    pause
)
