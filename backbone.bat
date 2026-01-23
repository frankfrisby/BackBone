@echo off
setlocal EnableDelayedExpansion

:: BACKBONE Engine Launcher
:: Optimized for terminal display

:: Check for relaunch flag
if "%~1"=="--launched" goto :run_app

:: Relaunch in new window (default size, not maximized)
start "BACKBONE" cmd /k ""%~f0" --launched"
exit /b

:run_app
title BACKBONE ENGINE

:: Enable ANSI escape sequences (Virtual Terminal Processing)
:: This reduces flickering by using proper terminal sequences
reg add HKCU\Console /v VirtualTerminalLevel /t REG_DWORD /d 1 /f >nul 2>&1

:: Set UTF-8 code page FIRST for proper character rendering
chcp 65001 >nul 2>&1

:: Don't set console size here - let the app resize after onboarding
:: The app will resize to 200x60 (approx 1800x1100px) after setup completes

:: Disable Quick Edit mode which can cause rendering issues
:: reg add HKCU\Console /v QuickEdit /t REG_DWORD /d 0 /f >nul 2>&1

:: Dark theme colors (black background, orange text)
color 06

:: Set initial console size (120 cols x 40 rows) for onboarding panel
mode con: cols=120 lines=40

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
