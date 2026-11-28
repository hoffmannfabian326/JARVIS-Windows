param([string]$Base64)

Add-Type -AssemblyName System.Windows.Forms

$text = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($Base64))
$previous = $null

try {
  $previous = Get-Clipboard -Raw -Format Text -ErrorAction Stop
} catch {
  $previous = $null
}

try {
  Set-Clipboard -Value $text
  Start-Sleep -Milliseconds 80
  [System.Windows.Forms.SendKeys]::SendWait("^v")
  Start-Sleep -Milliseconds 200
} catch {
  $message = $_.Exception.Message -replace '"', "'"
  Write-Output ('{"ok":false,"error":"' + $message + '"}')
  exit 1
} finally {
  if ($null -ne $previous) {
    try { Set-Clipboard -Value $previous } catch { }
  }
}

Write-Output '{"ok":true}'
