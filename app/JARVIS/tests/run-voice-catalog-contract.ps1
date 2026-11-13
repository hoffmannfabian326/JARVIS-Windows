# .NET Framework / Windows PowerShell 5.1. No microphone and no loudspeaker output.
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$temp=Join-Path $env:TEMP ('jarvis-catalog-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $temp | Out-Null
try {
 Add-Type -AssemblyName System.Speech
 Add-Type -AssemblyName System.Web.Extensions
 $program=Join-Path $temp 'VoiceCatalogContract.exe'
 Add-Type -Path @((Join-Path $root 'src-tauri/voice/VoiceCatalog.cs'),(Join-Path $root 'tests/native/VoiceCatalogContract.cs')) -ReferencedAssemblies ([System.Speech.Synthesis.SpeechSynthesizer].Assembly.Location),([System.Web.Script.Serialization.JavaScriptSerializer].Assembly.Location),'System.dll','System.Core.dll' -OutputAssembly $program -OutputType ConsoleApplication
 & $program
 if($LASTEXITCODE -ne 0){throw 'Native voice catalog contract failed'}
} finally {Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue}
