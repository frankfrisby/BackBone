@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul 2>&1

REM BACKBONE CLI launcher (for PATH-based usage: "backbone" from any terminal)
REM Resolves to the actual backbone.js location and runs with Node.js

set "BIN_DIR=%~dp0"
set "APP_DIR=%BIN_DIR%.."

reg add HKCU\Console /v VirtualTerminalLevel /t REG_DWORD /d 1 /f >nul 2>&1

set "NODE_EXE="
call :resolve_node
if errorlevel 1 goto :fatal

title BACKBONE

call :bootstrap_runtime
if errorlevel 1 goto :fatal

if defined BACKBONE_TEST_BOOTSTRAP_ONLY exit /b 0

"%NODE_EXE%" "%BIN_DIR%backbone.js" %*

if errorlevel 1 (
  echo.
  echo [BACKBONE] Exited with error code %errorlevel%
  echo.
  pause
)
exit /b %errorlevel%

:resolve_node
if exist "%APP_DIR%\node\node.exe" (
  set "NODE_EXE=%APP_DIR%\node\node.exe"
  goto :check_node_version
)

where node >nul 2>&1
if errorlevel 1 (
  echo [BACKBONE] Node.js not found. Attempting automatic install...
  call :install_node
  if errorlevel 1 exit /b 1
) else (
  set "NODE_EXE=node"
)

:check_node_version
"%NODE_EXE%" -e "process.exit(Number(process.versions.node.split('.')[0])>=20?0:1)"
if errorlevel 1 (
  echo [BACKBONE] Node.js v20+ required. Attempting upgrade...
  call :install_node
  if errorlevel 1 exit /b 1
  "%NODE_EXE%" -e "process.exit(Number(process.versions.node.split('.')[0])>=20?0:1)"
  if errorlevel 1 (
    echo [BACKBONE] Node.js upgrade failed. Install Node.js 20+ and retry.
    exit /b 1
  )
)
exit /b 0

:install_node
set "NODE_EXE="

where winget >nul 2>&1
if not errorlevel 1 (
  echo [BACKBONE] Installing/upgrading Node.js LTS via winget...
  winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements --silent >nul 2>&1
  call :refresh_node
  if not errorlevel 1 exit /b 0
)

where choco >nul 2>&1
if not errorlevel 1 (
  echo [BACKBONE] Installing/upgrading Node.js LTS via Chocolatey...
  choco install nodejs-lts -y >nul 2>&1
  call :refresh_node
  if not errorlevel 1 exit /b 0
)

echo [BACKBONE] Automatic Node.js install failed.
echo [BACKBONE] Install Node.js 20+ from https://nodejs.org and run again.
exit /b 1

:refresh_node
if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles(x86)%\nodejs\node.exe"
if not defined NODE_EXE (
  where node >nul 2>&1
  if not errorlevel 1 set "NODE_EXE=node"
)
if not defined NODE_EXE exit /b 1
exit /b 0

:bootstrap_runtime
if not exist "%BIN_DIR%bootstrap-runtime.cjs" exit /b 0
echo [BACKBONE] Checking runtime dependencies...
"%NODE_EXE%" "%BIN_DIR%bootstrap-runtime.cjs"
if errorlevel 1 (
  echo [BACKBONE] Runtime bootstrap failed.
  exit /b 1
)
exit /b 0

:fatal
echo.
echo [BACKBONE] Startup failed.
echo.
if defined BACKBONE_TEST_BOOTSTRAP_ONLY exit /b 1
pause
exit /b 1
