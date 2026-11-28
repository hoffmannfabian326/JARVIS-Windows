param([string]$Culture = "de-DE", [int]$Seconds = 6)

# Kurze Ja/Nein-Bestätigung über die Windows-Spracherkennung.
# Ein kleines Regelvokabular ist deutlich treffsicherer als freies Diktat —
# und es kann nicht versehentlich einen ganzen Satz als Bestätigung deuten.

Add-Type -AssemblyName System.Speech
$engine = $null
$seconds = [Math]::Min(10, [Math]::Max(3, $Seconds))

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
  $choices = New-Object System.Speech.Recognition.Choices
  $choices.Add([string[]]@("ja", "nein", "ja bitte", "nein danke", "abbrechen", "okay", "in ordnung"))

  $builder = New-Object System.Speech.Recognition.GrammarBuilder
  $builder.Append($choices)
  $grammar = New-Object System.Speech.Recognition.Grammar($builder)

  $engine.LoadGrammar($grammar)
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
