# Create Desktop Shortcut for BACKBONE Engine
# Run: powershell -ExecutionPolicy Bypass -File scripts/create-shortcut.ps1

$backboneDir = Split-Path -Parent $PSScriptRoot
if (-not $backboneDir -or -not (Test-Path $backboneDir)) {
    $backboneDir = (Get-Location).Path
}

$desktopPath = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktopPath "BACKBONE Engine.lnk"

$WshShell = New-Object -ComObject WScript.Shell
$shortcut = $WshShell.CreateShortcut($shortcutPath)

# Point to cmd.exe which allows setting window properties
$shortcut.TargetPath = "cmd.exe"
$shortcut.Arguments = "/c cd /d `"$backboneDir`" && mode con: cols=200 lines=85 && node bin/backbone.js"
$shortcut.WorkingDirectory = $backboneDir
$shortcut.Description = "BACKBONE Engine - Life Management CLI"
$shortcut.WindowStyle = 1  # Normal window

# Set icon if exists
$iconPath = Join-Path $backboneDir "assets\backbone.ico"
if (Test-Path $iconPath) {
    $shortcut.IconLocation = $iconPath
}

$shortcut.Save()

# Set console properties via registry for this specific shortcut
try {
    # The registry key is based on the shortcut target
    $regPath = "HKCU:\Console\%SystemRoot%_System32_cmd.exe"

    if (-not (Test-Path $regPath)) {
        New-Item -Path $regPath -Force | Out-Null
    }

    # Window size: 200 cols (0xC8) x 85 rows (0x55) = 0x005500C8
    Set-ItemProperty -Path $regPath -Name "WindowSize" -Value 0x005500C8 -Type DWord
    # Buffer size: 200 cols x 9999 rows = 0x270F00C8
    Set-ItemProperty -Path $regPath -Name "ScreenBufferSize" -Value 0x270F00C8 -Type DWord
    # Font size 18pt
    Set-ItemProperty -Path $regPath -Name "FontSize" -Value 0x00120000 -Type DWord
    # Consolas font
    Set-ItemProperty -Path $regPath -Name "FontFamily" -Value 54 -Type DWord
    Set-ItemProperty -Path $regPath -Name "FaceName" -Value "Consolas" -Type String
    # Window position (centered roughly)
    Set-ItemProperty -Path $regPath -Name "WindowPosition" -Value 0x00640064 -Type DWord
}
catch {
    Write-Host "Note: Could not set registry defaults" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "====================================" -ForegroundColor Cyan
Write-Host "  BACKBONE Engine Shortcut Created  " -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Location: $shortcutPath" -ForegroundColor Green
Write-Host ""
Write-Host "To ensure proper window size:" -ForegroundColor Yellow
Write-Host "  1. Right-click the shortcut"
Write-Host "  2. Select 'Properties'"
Write-Host "  3. Go to 'Layout' tab"
Write-Host "  4. Set Window Size: Width=200, Height=85"
Write-Host "  5. Set Screen Buffer: Width=200, Height=9999"
Write-Host "  6. Click OK"
Write-Host ""
Write-Host "You can also pin this shortcut to your taskbar!" -ForegroundColor Cyan
Write-Host ""
