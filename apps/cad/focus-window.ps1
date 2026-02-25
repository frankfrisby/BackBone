Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@

$procs = Get-Process | Where-Object { $_.ProcessName -eq "electron" -and $_.MainWindowHandle -ne 0 }
foreach ($p in $procs) {
    Write-Host "Found: $($p.Id) - $($p.MainWindowTitle) - Handle: $($p.MainWindowHandle)"
    [Win32]::ShowWindow($p.MainWindowHandle, 9)  # SW_RESTORE
    [Win32]::SetForegroundWindow($p.MainWindowHandle)
}
if (-not $procs) { Write-Host "No electron windows found" }
