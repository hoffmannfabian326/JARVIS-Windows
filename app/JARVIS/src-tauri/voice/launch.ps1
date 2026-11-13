param([Parameter(Mandatory=$true)][string]$Source)
$ErrorActionPreference = 'Stop'
try {
    [Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
    [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
    $request = [Console]::ReadLine()
    Add-Type -AssemblyName System.Speech
    Add-Type -AssemblyName System.Web.Extensions
    Add-Type -Path @($Source, (Join-Path (Split-Path $Source) 'AudioCapture.cs'), (Join-Path (Split-Path $Source) 'VoiceCatalog.cs')) -ReferencedAssemblies ([System.Speech.Synthesis.SpeechSynthesizer].Assembly.Location),([System.Web.Script.Serialization.JavaScriptSerializer].Assembly.Location),'System.dll','System.Core.dll'
    [JarvisVoice.Host]::Run($request)
} catch {
    [Console]::WriteLine('{"type":"error","error":"Lokaler Sprachhost konnte nicht gestartet werden. Windows PowerShell 5.1, .NET Framework und System.Speech pruefen."}')
}
