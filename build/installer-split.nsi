Unicode true
!include "MUI2.nsh"

!define APP_NAME "JARVIS"
!define APP_VERSION "0.1.0-alpha.2"
!define APP_PUBLISHER "J.A.R.V.I.S. Project"
!define APP_EXE "JARVIS.exe"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\JARVIS"

Name "${APP_NAME} ${APP_VERSION}"
OutFile "../release/JARVIS-Alpha-${APP_VERSION}-win-x64-Setup.exe"
InstallDir "$LOCALAPPDATA\Programs\${APP_NAME}"
InstallDirRegKey HKCU "Software\${APP_NAME}" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
BrandingText "J.A.R.V.I.S. Alpha"

VIProductVersion "0.1.0.2"
VIAddVersionKey "ProductName" "${APP_NAME}"
VIAddVersionKey "FileDescription" "J.A.R.V.I.S. Sprachassistent (Alpha)"
VIAddVersionKey "FileVersion" "${APP_VERSION}"
VIAddVersionKey "ProductVersion" "${APP_VERSION}"
VIAddVersionKey "LegalCopyright" "${APP_PUBLISHER}"

!define MUI_ABORTWARNING
!define MUI_ICON "icon.ico"
!define MUI_UNICON "icon.ico"
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "J.A.R.V.I.S. jetzt starten"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "German"

Section "J.A.R.V.I.S. installieren" InstallSection
  SetOutPath "$INSTDIR"
  File /r "../release/win-unpacked/*.*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  CreateDirectory "$SMPROGRAMS\JARVIS"
  CreateShortCut "$SMPROGRAMS\JARVIS\JARVIS.lnk" "$INSTDIR\${APP_EXE}"
  CreateShortCut "$SMPROGRAMS\JARVIS\Deinstallieren.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortCut "$DESKTOP\JARVIS.lnk" "$INSTDIR\${APP_EXE}"

  WriteRegStr HKCU "Software\${APP_NAME}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "${APP_NAME} ${APP_VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "Publisher" "${APP_PUBLISHER}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayIcon" "$INSTDIR\${APP_EXE}"
  WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\JARVIS.lnk"
  Delete "$SMPROGRAMS\JARVIS\JARVIS.lnk"
  Delete "$SMPROGRAMS\JARVIS\Deinstallieren.lnk"
  RMDir "$SMPROGRAMS\JARVIS"

  ; Autostart-Eintrag der App entfernen
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "JARVIS"

  DeleteRegKey HKCU "${UNINST_KEY}"
  DeleteRegKey HKCU "Software\${APP_NAME}"

  ; Konfiguration (%APPDATA%\JARVIS, inkl. .env) bleibt bewusst erhalten.
  RMDir /r "$INSTDIR"
SectionEnd
