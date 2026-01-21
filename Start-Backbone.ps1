# BACKBONE Engine Launcher
# Opens a properly sized console window and runs the app

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path

# Create a new console window with specific size
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "cmd.exe"
$psi.Arguments = "/c mode con: cols=200 lines=55 & title BACKBONE ENGINE & cd /d `"$scriptPath`" & node bin/backbone.js"
$psi.UseShellExecute = $true
$psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Normal

# Start the process
$process = [System.Diagnostics.Process]::Start($psi)

# Wait a moment for window to open, then resize it
Start-Sleep -Milliseconds 500

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
    [DllImport("user32.dll")]
    public static extern int GetSystemMetrics(int nIndex);
}
"@

# Get screen dimensions
$screenWidth = [Win32]::GetSystemMetrics(0)
$screenHeight = [Win32]::GetSystemMetrics(1)

# Target window size
$winWidth = 1400
$winHeight = 800

# Center on screen
$x = [Math]::Max(0, [int](($screenWidth - $winWidth) / 2))
$y = [Math]::Max(0, [int](($screenHeight - $winHeight) / 2))

# Get the main window handle and resize
if ($process.MainWindowHandle -ne [IntPtr]::Zero) {
    [Win32]::SetWindowPos($process.MainWindowHandle, [IntPtr]::Zero, $x, $y, $winWidth, $winHeight, 0x0040)
}
