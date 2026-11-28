param([string]$Culture = "de-DE", [int]$Seconds = 12)

Add-Type -AssemblyName System.Speech
$engine = $null
$seconds = [Math]::Min(25, [Math]::Max(4, $Seconds))

try {
  if ($Culture) {
    $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine ([System.Globalization.CultureInfo]::GetCultureInfo($Culture))
  }
} catch {
  $engine = $null
}

if ($null -eq $engine) {
  $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine
}

try {
  $engine.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
  $engine.SetInputToDefaultAudioDevice()
  $result = $engine.Recognize([TimeSpan]::FromSeconds($seconds))

  if ($null -ne $result -and $result.Text) {
    $payload = @{ ok = $true; text = $result.Text }
  } else {
    $payload = @{ ok = $false; error = "no-speech" }
  }
} catch {
  $message = $_.Exception.Message -replace '"', "'"
  $payload = @{ ok = $false; error = $message }
} finally {
  if ($null -ne $engine) { $engine.Dispose() }
}

$payload | ConvertTo-Json -Compress
