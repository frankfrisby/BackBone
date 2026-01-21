' Create Desktop Shortcut for Backbone
' Run this script to create a shortcut that can be pinned to taskbar

Set WshShell = WScript.CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Get script directory (backbone folder)
scriptPath = WScript.ScriptFullName
scriptDir = fso.GetParentFolderName(scriptPath)
backboneDir = fso.GetParentFolderName(scriptDir)

' Desktop path
desktopPath = WshShell.SpecialFolders("Desktop")

' Create shortcut
Set shortcut = WshShell.CreateShortcut(desktopPath & "\Backbone.lnk")
shortcut.TargetPath = "cmd.exe"
shortcut.Arguments = "/k cd /d """ & backboneDir & """ && node bin/backbone.js"
shortcut.WorkingDirectory = backboneDir
shortcut.IconLocation = backboneDir & "\assets\backbone.ico"
shortcut.Description = "Backbone - Life Management CLI"
shortcut.WindowStyle = 1
shortcut.Save

WScript.Echo "Shortcut created on Desktop: Backbone.lnk" & vbCrLf & vbCrLf & "You can now right-click it and select 'Pin to taskbar'"
