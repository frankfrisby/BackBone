@echo off
setlocal EnableDelayedExpansion

:: BACKBONE Engine Launcher
:: Optimized for terminal display

:: Check for relaunch flag
if "%~1"=="--launched" goto :run_app

:: Relaunch maximized
start "BACKBONE" /MAX cmd /k ""%~f0" --launched"
exit /b

:run_app
title BACKBONE ENGINE

:: Enable ANSI escape sequences (Virtual Terminal Processing)
:: This reduces flickering by using proper terminal sequences
reg add HKCU\Console /v VirtualTerminalLevel /t REG_DWORD /d 1 /f >nul 2>&1

:: Set UTF-8 code page FIRST for proper character rendering
chcp 65001 >nul 2>&1

:: Set console properties for best display
:: Larger buffer reduces screen tearing
mode con: cols=180 lines=60

:: Disable Quick Edit mode which can cause rendering issues
:: reg add HKCU\Console /v QuickEdit /t REG_DWORD /d 0 /f >nul 2>&1

:: Dark theme colors (black background, green text)
color 0A

:: Clear and show loading
cls
echo.
echo.
echo     ____  ___   ________ ______  ____  _   ________
echo    / __ )/   ^| / ____/ //_/ __ )/ __ \/ ^| / / ____/
echo   / __  / /^| ^|/ /   / ,^< / __  / / / /  ^|/ / __/
echo  / /_/ / ___ / /___/ /^| ^|/ /_/ / /_/ / /^|  / /___
echo /_____/_/  ^|_\____/_/ ^|_/_____/\____/_/ ^|_/_____/
echo.
echo                    AI-Powered Life Operating System
echo.
echo                          Loading engine...
echo.

:: Brief pause for visual
timeout /t 2 /nobreak >nul

:: Clear and run
cls

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
