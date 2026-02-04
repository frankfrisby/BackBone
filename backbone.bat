@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul 2>&1

title BACKBONE ENGINE
reg add HKCU\Console /v VirtualTerminalLevel /t REG_DWORD /d 1 /f >nul 2>&1
cd /d "%~dp0"

if exist "data\.backbone.lock" (
  for /f "usebackq tokens=*" %%L in ("data\.backbone.lock") do set "LOCKLINE=%%L"
  for /f "tokens=2 delims=:," %%a in ("!LOCKLINE!") do (
    set "LOCK_PID=%%~a"
    goto :checkpid
  )
)
goto :startbb

:checkpid
set "LOCK_PID=!LOCK_PID: =!"
set "LOCK_PID=!LOCK_PID:"=!"
tasklist /NH 2>nul | findstr /R "^node\.exe.*!LOCK_PID!" >nul 2>&1
if not errorlevel 1 (
  echo [BACKBONE] Already running, PID !LOCK_PID!
  timeout /t 2 /nobreak >nul
  exit /b 0
)
del "data\.backbone.lock" >nul 2>&1

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
