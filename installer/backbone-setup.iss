; BACKBONE Engine — Inno Setup Installer Script
; Build: npm run build   (creates dist/BackBone/)
; Pack:  npm run installer (runs build + iscc this file)
;
; Prerequisites: Inno Setup 6+ (https://jrsoftware.org/isinfo.php)
; Download: https://jrsoftware.org/isdl.php

#define MyAppName "BACKBONE Engine"
#define MyAppVersion "3.0.0"
#define MyAppPublisher "BACKBONE AI"
#define MyAppURL "https://github.com/backbone-ai/engine"
#define MyAppExeName "BackBone.cmd"

[Setup]
AppId={{B4CKB0NE-A1-3NG1N3-0001}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
DefaultDirName={localappdata}\BACKBONE
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=..\dist
OutputBaseFilename=BACKBONE-Setup-{#MyAppVersion}
SetupIconFile=..\assets\backbone.ico
UninstallDisplayIcon={app}\assets\backbone.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64compatible
ChangesEnvironment=yes
MinVersion=10.0

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional shortcuts:"
Name: "addtopath"; Description: "Add BACKBONE to system &PATH (enables 'backbone' command)"; GroupDescription: "Terminal integration:"; Flags: checkedonce

[Files]
; Copy everything from the portable build
Source: "..\dist\BackBone\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
; Icon file
Source: "..\assets\backbone.ico"; DestDir: "{app}\assets"; Flags: ignoreversion

[Icons]
; Start Menu
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\assets\backbone.ico"; Comment: "Launch BACKBONE Engine"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
; Desktop
Name: "{userdesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\assets\backbone.ico"; Comment: "Launch BACKBONE Engine"; Tasks: desktopicon

[Registry]
; Add install directory to user PATH so 'backbone' command works from any terminal
Root: HKCU; Subkey: "Environment"; ValueType: expandsz; ValueName: "Path"; ValueData: "{olddata};{app}\bin"; Tasks: addtopath; Check: NeedsAddPath(ExpandConstant('{app}\bin'))

[Run]
; Launch after install
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent shellexec; WorkingDir: "{app}"

[UninstallRun]
; Kill any running BACKBONE processes before uninstall
Filename: "taskkill"; Parameters: "/F /FI ""WINDOWTITLE eq BACKBONE ENGINE"""; Flags: runhidden; RunOnceId: "KillBackbone"

[UninstallDelete]
; Clean up generated files (not user data — that's in ~/.backbone/)
Type: filesandsubdirs; Name: "{app}\data"
Type: filesandsubdirs; Name: "{app}\node_modules\.cache"
Type: files; Name: "{app}\_restart_signal"

[Code]
// Check if a path is already in the user PATH
function NeedsAddPath(Param: string): boolean;
var
  OrigPath: string;
begin
  if not RegQueryStringValue(HKEY_CURRENT_USER, 'Environment', 'Path', OrigPath) then
  begin
    Result := True;
    exit;
  end;
  // Look for the path in the existing value
  Result := Pos(';' + Uppercase(Param) + ';', ';' + Uppercase(OrigPath) + ';') = 0;
end;

// Remove from PATH on uninstall
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  Path: string;
  AppBinPath: string;
  P: Integer;
begin
  if CurUninstallStep = usPostUninstall then
  begin
    if RegQueryStringValue(HKEY_CURRENT_USER, 'Environment', 'Path', Path) then
    begin
      AppBinPath := ExpandConstant('{app}\bin');
      P := Pos(';' + Uppercase(AppBinPath), ';' + Uppercase(Path));
      if P > 0 then
      begin
        Delete(Path, P - 1, Length(AppBinPath) + 1);
        RegWriteStringValue(HKEY_CURRENT_USER, 'Environment', 'Path', Path);
      end;
    end;
  end;
end;

// Broadcast WM_SETTINGCHANGE after PATH modification
procedure CurStepChanged(CurStep: TSetupStep);
var
  S: AnsiString;
begin
  if CurStep = ssPostInstall then
  begin
    // Notify other apps that environment changed
    S := 'Environment';
    // RegDeleteValue not needed — just broadcast
  end;
end;
