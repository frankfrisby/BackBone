@echo off

:: Check for relaunch flag (passed as argument)
if "%~1"=="--launched" goto :run_app

:: First run: relaunch this script maximized with flag
start "BACKBONE ENGINE" /MAX cmd /c ""%~f0" --launched"
exit /b

:run_app
title BACKBONE ENGINE
color 0A

:: Set buffer size (width=200, large height for scroll)
mode con: cols=200 lines=9999

cls
echo.
echo.
echo                                                    ========================================
echo                                                    ^|                                      ^|
echo                                                    ^|          BACKBONE ENGINE             ^|
echo                                                    ^|                                      ^|
echo                                                    ^|            Loading...                ^|
echo                                                    ^|                                      ^|
echo                                                    ========================================

ping -n 2 127.0.0.1 >nul
cls

cd /d "%~dp0"
node bin/backbone.js

if %errorlevel% neq 0 (
    echo.
    echo   ERROR: App exited with code %errorlevel%
    pause
)
