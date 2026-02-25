Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32Move {
    [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
}
"@

$procs = Get-Process -Name "electron" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }
foreach ($p in $procs) {
    $h = $p.MainWindowHandle
    $visible = [Win32Move]::IsWindowVisible($h)
    Write-Host "PID=$($p.Id) Title='$($p.MainWindowTitle)' Handle=$h Visible=$visible"
    [Win32Move]::ShowWindow($h, 9)   # SW_RESTORE
    [Win32Move]::MoveWindow($h, 100, 50, 1200, 800, $true)
    [Win32Move]::SetForegroundWindow($h)
    Write-Host "Moved to (100,50) 1200x800"
}
