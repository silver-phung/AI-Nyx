; electron-builder accepts one nsis.include; keep every customInstall/customUnInstall hook here.

!include "${__FILEDIR__}\orca-process-check.nsh"

; customInit runs after the install folder is chosen and before any old uninstaller is called.
; A side-by-side product must never install into, or "upgrade" away, a folder that holds Orca.
!macro customInit
  !if "${PRODUCT_FILENAME}" != "Orca"
    ${if} ${FileExists} "$INSTDIR\Orca.exe"
      MessageBox MB_OK|MB_ICONSTOP "${PRODUCT_NAME} Setup stopped: $INSTDIR contains Orca, which must not be changed." /SD IDOK
      Quit
    ${endIf}
  !endif
!macroend

; #10138/#23225: electron-builder’s APP_ASSOCIATE overwrites the extension’s default without backup,
; and APP_UNASSOCIATE never restores it. Register only additive ProgID/OpenWithProgids/SupportedTypes
; entries; never write the extension’s default handler. Sync extensions with isOsOpenedDocumentName().
; Product-scoped so a side-by-side product (e.g. AI-Nyx) never rewrites or deletes Orca's ProgIDs.
!define MARKDOWN_PROGID "${PRODUCT_FILENAME}.Markdown"
!define TABULAR_PROGID "${PRODUCT_FILENAME}.Tabular"

!macro ORCA_REGISTER_DOCUMENT_OPEN_WITH EXT PROGID
  WriteRegNone SHELL_CONTEXT "Software\Classes\${EXT}\OpenWithProgids" "${PROGID}"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" "${EXT}" ""
!macroend

!macro ORCA_UNREGISTER_DOCUMENT_OPEN_WITH EXT PROGID
  DeleteRegValue SHELL_CONTEXT "Software\Classes\${EXT}\OpenWithProgids" "${PROGID}"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" "${EXT}"
!macroend

!macro ORCA_REGISTER_DOCUMENT_PROGID PROGID NAME
  WriteRegStr SHELL_CONTEXT "Software\Classes\${PROGID}" "" "${NAME}"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${PROGID}\DefaultIcon" "" "$appExe,0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${PROGID}\shell\open" "" "Open with ${PRODUCT_NAME}"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${PROGID}\shell\open\command" "" '"$appExe" "%1"'
!macroend

!macro customInstall
  !insertmacro ORCA_REGISTER_DOCUMENT_PROGID "${MARKDOWN_PROGID}" "Markdown Document"
  !insertmacro ORCA_REGISTER_DOCUMENT_PROGID "${TABULAR_PROGID}" "Tabular Document"
  !insertmacro ORCA_REGISTER_DOCUMENT_OPEN_WITH ".md" "${MARKDOWN_PROGID}"
  !insertmacro ORCA_REGISTER_DOCUMENT_OPEN_WITH ".markdown" "${MARKDOWN_PROGID}"
  !insertmacro ORCA_REGISTER_DOCUMENT_OPEN_WITH ".mdx" "${MARKDOWN_PROGID}"
  !insertmacro ORCA_REGISTER_DOCUMENT_OPEN_WITH ".csv" "${TABULAR_PROGID}"
  !insertmacro ORCA_REGISTER_DOCUMENT_OPEN_WITH ".tsv" "${TABULAR_PROGID}"
  ; Why: Explorer caches the association list until told otherwise.
  System::Call "shell32::SHChangeNotify(i,i,i,i) (0x08000000, 0x1000, 0, 0)"
!macroend

; Relocated hosts escape $INSTDIR’s process/file sweep, surviving updates but requiring real-uninstall cleanup.
; Keep ${isUpdated}: uninstallOldVersion runs this hook on every update and must preserve terminals.
; Sync LOCALAPPDATA root with LOCAL_HOST_ROOT_NAME in src/main/daemon/daemon-host-relocation.ts;
; see docs/reference/windows-daemon-host-relocation.md.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    Push $0
    Push $1
    Push $2
    ; The verbatim app exe and an older renamed host both need cleanup, scoped to the current user
    ; like upstream KILL_PROCESS. NSIS expands USERNAME directly, avoiding two cmd.exe spawns.
    ReadEnvStr $1 USERNAME
    ${if} $1 == ""
      ; taskkill rejects an empty user filter and kills nothing. Fall back unfiltered if the normally set USERNAME is absent.
      StrCpy $2 ""
    ${else}
      StrCpy $2 '/FI "USERNAME eq $1"'
    ${endIf}
    nsExec::Exec 'taskkill /F /IM "${APP_EXECUTABLE_FILENAME}" $2'
    Pop $0
    ; The legacy host image name belongs to Orca; other products must not kill Orca's terminals.
    !if "${PRODUCT_FILENAME}" == "Orca"
      nsExec::Exec 'taskkill /F /IM "orca-terminal-daemon.exe" $2'
      Pop $0
    !endif
    ; WSL hosts: the detached wsl.exe holders outlive the app and keep their distros running. Orca
    ; ends only the holders its profile recorded, each checked by pid, start time and command line.
    ; Only a userData that has a holder folder launches it: everyone who never ran a WSL host sees
    ; nothing here. These are the folders Electron's userData (app.getName()) can be, as the
    ; deleteAppData step lists them; a custom --user-data-dir can't be known here.
    ; Sync the flag with WSL_HOLDER_UNINSTALL_FLAG in src/main/startup/wsl-holder-uninstall-preflight.ts.
    ${if} $installMode == "all"
      SetShellVarContext current
    ${endIf}
    StrCpy $1 ""
    ${if} ${FileExists} "$APPDATA\${APP_FILENAME}\wsl-distro-holders\*.json"
      StrCpy $1 "1"
    ${endIf}
    !ifdef APP_PRODUCT_FILENAME
      ${if} ${FileExists} "$APPDATA\${APP_PRODUCT_FILENAME}\wsl-distro-holders\*.json"
        StrCpy $1 "1"
      ${endIf}
    !endif
    !ifdef APP_PACKAGE_NAME
      ${if} ${FileExists} "$APPDATA\${APP_PACKAGE_NAME}\wsl-distro-holders\*.json"
        StrCpy $1 "1"
      ${endIf}
    !endif
    ${if} $installMode == "all"
      SetShellVarContext all
    ${endIf}
    ${if} $1 == "1"
      nsExec::Exec '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --orca-uninstall-release-wsl-holders'
      Pop $0
    ${endIf}
    Pop $2
    Pop $1
    Pop $0
    ; Give the OS a moment to release the image lock before removing the tree.
    Sleep 500
    RMDir /r "$LOCALAPPDATA\${PRODUCT_FILENAME}\daemon-host"
    RMDir /r "$LOCALAPPDATA\${PRODUCT_FILENAME}\daemon-host-profiles"
  ${endIf}
  ; customInstall rewrites associations on every update, so remove them during uninstallOldVersion too.
  DeleteRegKey SHELL_CONTEXT "Software\Classes\${MARKDOWN_PROGID}"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\${TABULAR_PROGID}"
  !insertmacro ORCA_UNREGISTER_DOCUMENT_OPEN_WITH ".md" "${MARKDOWN_PROGID}"
  !insertmacro ORCA_UNREGISTER_DOCUMENT_OPEN_WITH ".markdown" "${MARKDOWN_PROGID}"
  !insertmacro ORCA_UNREGISTER_DOCUMENT_OPEN_WITH ".mdx" "${MARKDOWN_PROGID}"
  !insertmacro ORCA_UNREGISTER_DOCUMENT_OPEN_WITH ".csv" "${TABULAR_PROGID}"
  !insertmacro ORCA_UNREGISTER_DOCUMENT_OPEN_WITH ".tsv" "${TABULAR_PROGID}"
  System::Call "shell32::SHChangeNotify(i,i,i,i) (0x08000000, 0x1000, 0, 0)"
!macroend
