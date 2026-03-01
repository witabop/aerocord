; Aerocord Inno Setup script (64-bit)
; Build the app first: npm run package
; Then compile this script with Inno Setup (File > Open > aerocord.iss > Build > Compile).
; The packaged app must exist at: out\aerocord-win32-x64\

#define MyAppName "Aerocord"
#define MyAppVersion "3"
#define MyAppPublisher "witabop"
#define MyAppURL "https://github.com/witabop/aerocord"
#define MyAppExeName "aerocord.exe"
#define PackagedDir "out\aerocord-win32-x64"

[Setup]
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
; Use Documents folder so compilation always has write access
OutputDir=userdocs:Aerocord Installer Output
OutputBaseFilename=Aerocord-Setup-{#MyAppVersion}
SetupIconFile=src\assets\images\icons\MainWnd.ico
; 64-bit only (x64 and Windows 11 on Arm)
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
; Close Aerocord if running before upgrading
CloseApplications=yes
CloseApplicationsFilter=aerocord.exe

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; Copy the entire packaged Electron app (exe, resources, DLLs, etc.)
Source: "{#PackagedDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
