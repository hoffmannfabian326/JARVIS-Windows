param([Parameter(Mandatory=$true)][string]$Binary,[Parameter(Mandatory=$true)][string]$OutputDirectory)
# Firewall elevation belongs ONLY to CI verification, never to app requirements.
$ErrorActionPreference='Stop'
$rule='JARVIS-chat-CI-'+[Guid]::NewGuid().ToString('N')
try {
 New-NetFirewallRule -DisplayName $rule -Direction Outbound -Program $Binary -Action Block -Profile Any -Enabled True | Out-Null
 $profiles=@(Get-NetFirewallProfile -PolicyStore ActiveStore)
 if($profiles.Count -ne 3 -or @($profiles|Where-Object {$_.Enabled.ToString() -ne 'True'}).Count -gt 0){throw 'Outbound block cannot be certified; no provider send allowed'}
 if((Get-Service MpsSvc).Status -ne 'Running'){throw 'Firewall service is not active'}
 $active=Get-NetFirewallRule -PolicyStore ActiveStore -DisplayName $rule
 if($active.Enabled.ToString() -ne 'True' -or $active.Action.ToString() -ne 'Block'){throw 'Outbound rule not active'}
 $env:JARVIS_CI_OUTBOUND_BLOCKED='1'
 node tests/windows-chat-smoke.cjs $Binary $OutputDirectory
 if($LASTEXITCODE -ne 0){throw 'Real Windows chat UI verification failed'}
} finally {
 Remove-Item Env:JARVIS_CI_OUTBOUND_BLOCKED -ErrorAction SilentlyContinue
 Remove-NetFirewallRule -DisplayName $rule -ErrorAction SilentlyContinue
}
