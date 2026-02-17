# BACKBONE Engine Launcher
# Runs BACKBONE directly in this window - no second terminal spawned

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path

function Resolve-NodeExecutable {
    param([string]$RootPath)

    $bundled = Join-Path $RootPath "node\node.exe"
    if (Test-Path $bundled) { return $bundled }

    $programFilesNode = Join-Path $env:ProgramFiles "nodejs\node.exe"
    if (Test-Path $programFilesNode) { return $programFilesNode }

    $programFilesX86Node = Join-Path ${env:ProgramFiles(x86)} "nodejs\node.exe"
    if (Test-Path $programFilesX86Node) { return $programFilesX86Node }

    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    if ($nodeCmd) { return $nodeCmd.Source }

    return $null
}

function Get-NodeMajorVersion {
    param([string]$NodePath)

    if (-not $NodePath) { return 0 }

    try {
        $raw = & $NodePath -e "process.stdout.write(String(Number.parseInt(process.versions.node.split('.')[0], 10) || 0))"
        return [int]$raw
    } catch {
        return 0
    }
}

function Install-NodeJsLts {
    param([string]$RootPath)

    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if ($winget) {
        Write-Host "[BACKBONE] Installing/upgrading Node.js LTS via winget..."
        & $winget.Source install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements --silent | Out-Null
        $resolved = Resolve-NodeExecutable -RootPath $RootPath
        if ($resolved) { return $resolved }
    }

    $choco = Get-Command choco -ErrorAction SilentlyContinue
    if ($choco) {
        Write-Host "[BACKBONE] Installing/upgrading Node.js LTS via Chocolatey..."
        & $choco.Source install nodejs-lts -y | Out-Null
        $resolved = Resolve-NodeExecutable -RootPath $RootPath
        if ($resolved) { return $resolved }
    }

    return $null
}

# Singleton check: exit immediately if BACKBONE is already running
$lockFile = Join-Path $scriptPath "data\.backbone.lock"
if (Test-Path $lockFile) {
    try {
        $lockData = Get-Content $lockFile -Raw | ConvertFrom-Json
        if ($lockData.pid) {
            $proc = Get-Process -Id $lockData.pid -ErrorAction SilentlyContinue
            if ($proc -and $proc.ProcessName -match "node") {
                exit
            }
        }
    } catch {
        # Corrupt lock - continue
    }
}

# Also check by window title as fallback (matches both launcher and node-set titles)
$existingWindow = Get-Process -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowTitle -match "BACKBONE" }
if ($existingWindow -and $existingWindow.Id -ne $PID) {
    exit
}

# Set window title and encoding (Node.js will override with "BACKBONE [Name]" via ANSI escape)
$Host.UI.RawUI.WindowTitle = "BACKBONE"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 | Out-Null

# Enable ANSI escape sequences
reg add HKCU\Console /v VirtualTerminalLevel /t REG_DWORD /d 1 /f 2>&1 | Out-Null

# Center and size this window immediately
try {
    Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
    [DllImport("kernel32.dll")]
    public static extern IntPtr GetConsoleWindow();
    [DllImport("user32.dll")]
    public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);
    [DllImport("user32.dll")]
    public static extern int GetSystemMetrics(int nIndex);
}
"@
    $hwnd = [Win32]::GetConsoleWindow()
    $screenWidth = [Win32]::GetSystemMetrics(0)
    $screenHeight = [Win32]::GetSystemMetrics(1)
    $winWidth = 1100
    $winHeight = 700
    $x = [Math]::Max(0, [int](($screenWidth - $winWidth) / 2))
    $y = [Math]::Max(0, [int](($screenHeight - $winHeight) / 2))
    [Win32]::MoveWindow($hwnd, $x, $y, $winWidth, $winHeight, $true) | Out-Null
} catch {
    # Window positioning failed - not critical
}

# Ensure Node.js exists and is at least v20
$nodeExe = Resolve-NodeExecutable -RootPath $scriptPath
if (-not $nodeExe) {
    Write-Host "[BACKBONE] Node.js not found. Attempting automatic install..."
    $nodeExe = Install-NodeJsLts -RootPath $scriptPath
}

if (-not $nodeExe) {
    Write-Host ""
    Write-Host "[BACKBONE] Automatic Node.js install failed."
    Write-Host "[BACKBONE] Install Node.js 20+ from https://nodejs.org and retry."
    Write-Host ""
    if ($env:BACKBONE_TEST_BOOTSTRAP_ONLY -eq "1") { exit 1 }
    Read-Host "Press Enter to exit"
    exit 1
}

$nodeMajor = Get-NodeMajorVersion -NodePath $nodeExe
if ($nodeMajor -lt 20) {
    Write-Host "[BACKBONE] Node.js v20+ is required. Attempting upgrade..."
    $nodeExe = Install-NodeJsLts -RootPath $scriptPath
    $nodeMajor = Get-NodeMajorVersion -NodePath $nodeExe
}

if ($nodeMajor -lt 20) {
    Write-Host ""
    Write-Host "[BACKBONE] Node.js version is too old. Found major version: $nodeMajor"
    Write-Host "[BACKBONE] Install Node.js 20+ and retry."
    Write-Host ""
    if ($env:BACKBONE_TEST_BOOTSTRAP_ONLY -eq "1") { exit 1 }
    Read-Host "Press Enter to exit"
    exit 1
}

# Run runtime dependency bootstrap before starting app
$bootstrapScript = Join-Path $scriptPath "bin\bootstrap-runtime.cjs"
if (Test-Path $bootstrapScript) {
    Write-Host "[BACKBONE] Checking runtime dependencies..."
    & $nodeExe $bootstrapScript
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "[BACKBONE] Runtime bootstrap failed."
        Write-Host ""
        if ($env:BACKBONE_TEST_BOOTSTRAP_ONLY -eq "1") { exit 1 }
        Read-Host "Press Enter to exit"
        exit 1
    }
}

if ($env:BACKBONE_TEST_BOOTSTRAP_ONLY -eq "1") {
    exit 0
}

# Prevent server from also launching a browser
$env:BACKBONE_NO_BROWSER = "1"

# Run BACKBONE with auto-restart support (same as backbone.bat)
Set-Location $scriptPath
do {
    $restart = $false
    & $nodeExe bin/backbone.js $args

    # Check for restart signal (set by auto-updater)
    $restartSignal = Join-Path $scriptPath "_restart_signal"
    if (Test-Path $restartSignal) {
        Remove-Item $restartSignal -Force -ErrorAction SilentlyContinue
        Write-Host "[BACKBONE] Update applied, restarting..."
        Start-Sleep -Seconds 1
        $restart = $true
    }
} while ($restart)

if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne $null) {
    Write-Host ""
    Write-Host "  [ERROR] BACKBONE exited with error code $LASTEXITCODE"
    Write-Host ""
    Read-Host "Press Enter to exit"
}
