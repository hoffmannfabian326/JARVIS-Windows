param([Parameter(Mandatory=$true)][string]$Installer,[Parameter(Mandatory=$true)][string]$OutputDirectory)
# Native installation / UI / local CPU smoke. Never grants or starts microphone capture.
$ErrorActionPreference='Stop'
New-Item -ItemType Directory -Force $OutputDirectory | Out-Null
$result=[ordered]@{os=(Get-CimInstance Win32_OperatingSystem).Caption;client_windows_10_11=$false;installed=$false;window_created=$false;hud_rendered=$false;microphone_default_off=$false;local_cpu_tool=$false;offline_enforced=$false;graceful_close=$false;uninstalled=$false;audio_recorded=$false;real_provider_requests=$false;notes=@()}
$install=Join-Path $env:RUNNER_TEMP ('jarvis141-install-'+[Guid]::NewGuid().ToString('N'))
$firewall='JARVIS-acceptance-'+[Guid]::NewGuid().ToString('N')
$app=$null;$oldBrowserArgs=$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS
try {
    $setup=Start-Process -FilePath $Installer -ArgumentList @('/S',"/D=$install") -PassThru -Wait
    if($setup.ExitCode -ne 0){throw 'NSIS installation failed'}
    $binary=Join-Path $install 'jarvis-command-center.exe'
    if(-not(Test-Path $binary)){throw 'Installed application missing'}
    foreach($name in @('VoiceHost.cs','AudioCapture.cs','VoiceCatalog.cs','launch.ps1')) {
        $resource=Join-Path $install "voice/$name"
        if(-not(Test-Path $resource)){throw "Installed voice resource missing: $name"}
        if((Get-FileHash $resource).Hash -ne (Get-FileHash "src-tauri/voice/$name").Hash){throw "Installed resource differs: $name"}
    }
    $result.installed=$true
    try {
        New-NetFirewallRule -DisplayName $firewall -Direction Outbound -Program $binary -Action Block -Profile Any | Out-Null
        $profiles=@(Get-NetFirewallProfile | Where-Object Enabled)
        $result.offline_enforced=($profiles.Count -gt 0)
    } catch {$result.notes+= 'Program-specific outbound firewall check unavailable; offline behavior not certified.'}
    $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--force-renderer-accessibility'
    $app=Start-Process -FilePath $binary -PassThru
    $deadline=[DateTime]::UtcNow.AddSeconds(45)
    do {
        Start-Sleep -Milliseconds 300;$app.Refresh()
        if($app.HasExited){throw 'Installed application exited before opening its window'}
        $handle=$app.MainWindowHandle
    } while($handle -eq 0 -and [DateTime]::UtcNow -lt $deadline)
    if($handle -eq 0){throw 'Native application window not observed'}
    $result.window_created=$true
    Add-Type -AssemblyName UIAutomationClient
    Add-Type -AssemblyName UIAutomationTypes
    function Read-Elements {
        $root=[System.Windows.Automation.AutomationElement]::FromHandle($handle)
        return $root.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
    }
    function Read-Names($elements) {
        $names=@();foreach($el in $elements){try{$names+= $el.Current.Name}catch{}}
        return $names
    }
    $deadline=[DateTime]::UtcNow.AddSeconds(35)
    do {
        Start-Sleep -Milliseconds 500
        try {$elements=Read-Elements;$names=Read-Names $elements} catch {$names=@()}
        $result.hud_rendered=($names -contains 'NEURAL INTELLIGENCE CORE')
    } while(-not $result.hud_rendered -and [DateTime]::UtcNow -lt $deadline)
    if($result.hud_rendered) {
        $result.microphone_default_off=($names -contains 'MIKROFON AUS')
        if($names -contains 'MIKROFON AKTIV' -or $names -contains 'WAKE WORD HÖRT LOKAL'){throw 'Microphone unexpectedly active on startup'}
        if(-not $result.microphone_default_off){throw 'Rendered microphone default-off state not observed'}
        $tools=$null
        foreach($el in $elements){try{if($el.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button -and $el.Current.Name -match '(^|\s)Tools$'){$tools=$el;break}}catch{}}
        if($tools){
            try {
                ([System.Windows.Automation.InvokePattern]$tools.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)).Invoke()
                Start-Sleep -Seconds 1
                $cpu=$null
                foreach($el in (Read-Elements)){try{if($el.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button -and $el.Current.Name -eq 'CPU-Auslastung'){$cpu=$el;break}}catch{}}
                if($cpu){
                    ([System.Windows.Automation.InvokePattern]$cpu.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)).Invoke()
                    $deadline=[DateTime]::UtcNow.AddSeconds(15)
                    do {Start-Sleep -Milliseconds 300;$names=Read-Names (Read-Elements);$result.local_cpu_tool=(@($names|Where-Object{$_ -like 'Die CPU-Auslastung beträgt:*'}).Count -gt 0)} while(-not $result.local_cpu_tool -and [DateTime]::UtcNow -lt $deadline)
                }
            }catch{$result.notes+='UI Automation tool activation unavailable on this runner; local tool runtime check incomplete.'}
        }
        if(-not $result.local_cpu_tool){$result.notes+='Local CPU action not observed via UI Automation; Windows client check still required.'}
    } else {$result.notes+='Window started, but HUD accessibility tree unavailable; rendered UI and default-off not certified.'}
    $result.database_created=Test-Path (Join-Path $env:APPDATA 'com.jarvis.commandcenter/neural.sqlite3')
    $app.Refresh()
    if($app.HasExited){throw 'Application unexpectedly exited during native smoke'}
    if(-not $app.CloseMainWindow()){throw 'Native close request unavailable'}
    $result.graceful_close=$app.WaitForExit(15000)
    if(-not $result.graceful_close){throw 'Application did not close normally'}
    if($app.ExitCode -ne 0){throw 'Application exited with an error'}
    $uninstallers=@(Get-ChildItem $install -Filter '*uninstall*.exe')
    if($uninstallers.Count -ne 1){throw 'NSIS uninstaller missing'}
    $uninstall=Start-Process -FilePath $uninstallers[0].FullName -ArgumentList '/S' -Wait -PassThru
    if($uninstall.ExitCode -ne 0){throw 'NSIS uninstall failed'}
    $deadline=[DateTime]::UtcNow.AddSeconds(15)
    while((Test-Path $binary) -and [DateTime]::UtcNow -lt $deadline){Start-Sleep -Milliseconds 300}
    if(Test-Path $binary){throw 'Application executable remained after uninstall'}
    $result.uninstalled=$true
    $result.database_preserved_after_uninstall=Test-Path (Join-Path $env:APPDATA 'com.jarvis.commandcenter/neural.sqlite3')
} finally {
    if($app){try{if(-not $app.HasExited){$app.Kill();$app.WaitForExit(5000)|Out-Null}}catch{}}
    Remove-NetFirewallRule -DisplayName $firewall -ErrorAction SilentlyContinue
    $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=$oldBrowserArgs
    $result|ConvertTo-Json -Depth 6|Set-Content (Join-Path $OutputDirectory 'WINDOWS_RUNTIME_SMOKE.json') -Encoding utf8NoBOM
}
$result|ConvertTo-Json -Depth 6
