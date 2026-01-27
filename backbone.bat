@echo off
setlocal EnableDelayedExpansion

:: BACKBONE Engine Launcher

title BACKBONE ENGINE

:: Set console buffer and resize window
mode con: cols=140 lines=50
:: Use PowerShell to resize the actual window to a large size
powershell -NoProfile -Command "Add-Type @'
using System; using System.Runtime.InteropServices;
public class Win { [DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow(); [DllImport(\"user32.dll\")] public static extern bool MoveWindow(IntPtr h,int x,int y,int w,int h2,bool r); }
'@; $w=[Win]::GetForegroundWindow(); [Win]::MoveWindow($w,50,20,1200,950,$true)" >nul 2>&1

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
