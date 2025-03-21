!include "x64.nsh"

!macro customHeader
  # We always want to be admin, so that we can install Windows features.
  ManifestSupportedOS Win10
  RequestExecutionLevel admin
  # Enable ShowInstDetails to get logs from scripts.
  #ShowInstDetails show
!macroend

!macro customInstall
  Push $R0

  ${If} ${IsWow64}
    ${DisableX64FSRedirection}
  ${EndIf}

  # Add the bin directory to the PATH
  File "/oname=$PLUGINSDIR\add-to-path.ps1" "${BUILD_RESOURCES_DIR}\add-to-path.ps1"
  nsExec::ExecToLog 'powershell.exe \
    -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned \
    -File "$PLUGINSDIR\add-to-path.ps1" "$INSTDIR"'
  Pop $R0

  # Install WSL, if required
  DetailPrint "Installing Windows Subsystem for Linux"
  File "/oname=$PLUGINSDIR\install-wsl.ps1" "${BUILD_RESOURCES_DIR}\install-wsl.ps1"
  nsExec::ExecToLog 'powershell.exe \
    -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned \
    -File "$PLUGINSDIR\install-wsl.ps1"'
  Pop $R0
  ${If} $R0 == "error"
    Abort "Could not install Windows Subsystem for Linux."
  ${ElseIf} $R0 == 0
    # WSL was already installed
  ${ElseIf} $R0 == 101
    # WSL was installed, a reboot is required.
    SetRebootFlag true
  ${Else}
    # Unexpected exit code
    Abort "Unexpected error installing Windows subsystem for Linux: $R0"
  ${EndIf}

  # Migrate WSL distro name from 'k3s' to 'rancher-desktop'
  DetailPrint "Migrating from previous versions: renaming wsl distribution"
  File "/oname=$PLUGINSDIR\migrate-wsl-from-v020.ps1" "${BUILD_RESOURCES_DIR}\migrate-wsl-from-v020.ps1"
  nsExec::ExecToLog 'powershell.exe \
    -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned \
    -File "$PLUGINSDIR\migrate-wsl-from-v020.ps1"'
  Pop $R0
  ${If} $R0 == "error"
    MessageBox MB_OK|MB_ICONEXCLAMATION "Could not carry out migration to wsl distribution rename."
  ${ElseIf} $R0 == 0
    # Successful migration
  ${Else}
    # Unexpected exit code
    MessageBox MB_OK "Unexpected error in migration to wsl distribution rename: $R0"
  ${EndIf}

  ${If} ${IsWow64}
    ${EnableX64FSRedirection}
  ${EndIf}

  Pop $R0
!macroend

# Bypass the install mode prompt, always install per-user.
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

!macro customUnInstall
  # Remove the bin directory from the PATH
  File "/oname=$PLUGINSDIR\remove-from-path.ps1" "${BUILD_RESOURCES_DIR}\remove-from-path.ps1"
  nsExec::ExecToLog 'powershell.exe \
    -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned \
    -File "$PLUGINSDIR\remove-from-path.ps1" "$INSTDIR"'
  Pop $R0
!macroend
