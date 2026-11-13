# Windows-only local smoke check. Enumerates providers; NEVER opens the microphone.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$hostScript = Join-Path $projectRoot 'src-tauri\voice\launch.ps1'
$hostSource = Join-Path $projectRoot 'src-tauri\voice\VoiceHost.cs'
# Use the same raw UTF-8 stdin transport as Rust. PowerShell's native-command
# pipeline can transform the request and is not an equivalent IPC smoke test.
$process = New-Object System.Diagnostics.Process
$process.StartInfo.FileName = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$process.StartInfo.Arguments = "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$hostScript`" -Source `"$hostSource`""
$process.StartInfo.UseShellExecute = $false
$process.StartInfo.CreateNoWindow = $true
$process.StartInfo.RedirectStandardInput = $true
$process.StartInfo.RedirectStandardOutput = $true
$process.StartInfo.RedirectStandardError = $true
$previousInputEncoding = [Console]::InputEncoding
try {
    # .NET Framework derives Process.StandardInput encoding from Console.InputEncoding.
    # Explicitly suppress its BOM so the child receives exactly Rust's UTF-8 JSON.
    [Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
    if (-not $process.Start()) { throw 'Sprachhost konnte nicht gestartet werden.' }
    $stdout = $process.StandardOutput.ReadToEndAsync()
    $stderr = $process.StandardError.ReadToEndAsync()
    $process.StandardInput.WriteLine('{"mode":"probe"}')
    $process.StandardInput.Flush()
    $process.StandardInput.Close()
    if (-not $process.WaitForExit(30000)) {
        $process.Kill()
        throw 'Sprachhost-Pruefung nach 30 Sekunden abgebrochen.'
    }
    $output = $stdout.Result.Trim()
    if ($process.ExitCode -ne 0 -or ($output | ConvertFrom-Json).type -ne 'capabilities') {
        throw 'Lokale Sprachhost-Kompilierung oder UTF-8-Probe fehlgeschlagen.'
    }
    Write-Output $output
} finally {
    $process.Dispose()
    [Console]::InputEncoding = $previousInputEncoding
}
