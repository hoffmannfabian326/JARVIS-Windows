# Uses synthetic PCM and a fake WinMM ABI boundary. NEVER records a microphone.
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$temp=Join-Path $env:TEMP ('jarvis-audio-contract-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $temp | Out-Null
try {
    $vswhere=Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
    $vs=& $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    if(-not $vs){throw 'MSVC x64 compiler unavailable'}
    $vcvars=Join-Path $vs 'VC\Auxiliary\Build\vcvars64.bat'
    $source=Join-Path $root 'tests\native\wave-contract.c'
    $cmd=Join-Path $temp 'compile.cmd'
    @"
@echo off
call "$vcvars" >nul
if errorlevel 1 exit /b 1
cl.exe /nologo /LD /O2 "$source" /link /OUT:"$temp\jarvis_wave_test.dll"
"@ | Set-Content $cmd -Encoding ascii
    Push-Location $temp
    try { & $env:ComSpec /d /c $cmd;if($LASTEXITCODE -ne 0){throw 'Native contract boundary compilation failed'} } finally {Pop-Location}
    $capture=(Get-Content (Join-Path $root 'src-tauri\voice\AudioCapture.cs') -Raw).Replace('"winmm.dll"','"jarvis_wave_test.dll"')
    $capturePath=Join-Path $temp 'AudioCapture.cs'
    [IO.File]::WriteAllText($capturePath,$capture,(New-Object Text.UTF8Encoding($false)))
    $program=Join-Path $temp 'AudioCaptureContract.exe'
    Add-Type -Path @($capturePath,(Join-Path $root 'tests\native\AudioCaptureContract.cs')) -ReferencedAssemblies 'System.dll','System.Core.dll' -OutputAssembly $program -OutputType ConsoleApplication
    & $program
    if($LASTEXITCODE -ne 0){throw 'AudioCapture lifecycle contract failed'}
} finally {Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue}
