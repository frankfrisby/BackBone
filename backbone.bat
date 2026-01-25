@echo off
setlocal EnableDelayedExpansion

:: BACKBONE Engine Launcher
:: Runs directly in current terminal - no new window

title BACKBONE ENGINE

:: Enable ANSI escape sequences (Virtual Terminal Processing)
reg add HKCU\Console /v VirtualTerminalLevel /t REG_DWORD /d 1 /f >nul 2>&1

:: Set UTF-8 code page for proper character rendering
chcp 65001 >nul 2>&1

:: Dark theme colors (black background, orange text)
color 06

:: Change to script directory
cd /d "%~dp0"

:: Run BACKBONE
node bin/backbone.js

:: Handle errors
if %errorlevel% neq 0 (
    echo.
    echo   [ERROR] BACKBONE exited with code %errorlevel%
    echo.
    echo   Press any key to close...
    pause >nul
)
