'use strict';

const WINDOWS_VK = {
  playpause: 0xb3,
  next: 0xb0,
  previous: 0xb1,
  up: 0xaf,
  down: 0xae,
  mute: 0xad,
};

const MAC_VOLUME = {
  up: 'set volume output volume ((output volume of (get volume settings)) + 7)',
  down: 'set volume output volume ((output volume of (get volume settings)) - 7)',
  mute: 'set volume output muted (not (output muted of (get volume settings)))',
};

function windowsKey(vk) {
  return [
    '$sig = \'[DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);\'',
    'Add-Type -MemberDefinition $sig -Name Kb -Namespace Jarvis | Out-Null',
    `[Jarvis.Kb]::keybd_event(${vk},0,0,0)`,
    `[Jarvis.Kb]::keybd_event(${vk},0,2,0)`,
  ].join('; ');
}

function windowsCommand(vk) {
  return {
    command: 'powershell.exe',
    args: ['-NoProfile', '-NonInteractive', '-Command', windowsKey(vk)],
  };
}

function macMediaScript(action) {
  const verb =
    action === 'playpause' ? 'playpause' : action === 'next' ? 'next track' : 'previous track';
  return [
    'repeat with appName in {"Spotify", "Music", "VLC"}',
    'try',
    `tell application (appName as text) to ${verb}`,
    'return',
    'end try',
    'end repeat',
  ].join('\n');
}

function mediaCommand(action, platform = process.platform) {
  const normalized = ['playpause', 'next', 'previous'].includes(action) ? action : 'playpause';
  if (platform === 'win32') return windowsCommand(WINDOWS_VK[normalized]);
  if (platform === 'darwin') return { command: 'osascript', args: ['-e', macMediaScript(normalized)] };
  return { command: 'playerctl', args: [normalized === 'playpause' ? 'play-pause' : normalized] };
}

function volumeCommand(direction, platform = process.platform) {
  const normalized = ['up', 'down', 'mute'].includes(direction) ? direction : 'mute';
  if (platform === 'win32') return windowsCommand(WINDOWS_VK[normalized]);
  if (platform === 'darwin') return { command: 'osascript', args: ['-e', MAC_VOLUME[normalized]] };
  if (normalized === 'mute') {
    return { command: 'pactl', args: ['set-sink-mute', '@DEFAULT_SINK@', 'toggle'] };
  }
  return {
    command: 'pactl',
    args: ['set-sink-volume', '@DEFAULT_SINK@', normalized === 'up' ? '+5%' : '-5%'],
  };
}

function lockCommand(platform = process.platform) {
  if (platform === 'win32') {
    return { command: 'rundll32.exe', args: ['user32.dll,LockWorkStation'] };
  }
  if (platform === 'darwin') {
    return { command: 'pmset', args: ['displaysleepnow'] };
  }
  return {
    command: 'loginctl',
    args: ['lock-session'],
    fallback: { command: 'xdg-screensaver', args: ['lock'] },
  };
}

/**
 * Gesprochene Namen → Programm des jeweiligen Systems. Die Liste deckt die
 * üblichen Fälle ab; alles andere geht unverändert an das System, damit auch
 * Programme funktionieren, die hier nicht stehen.
 */
const APP_ALIASES = {
  win32: {
    chrome: 'chrome',
    'google chrome': 'chrome',
    edge: 'msedge',
    'microsoft edge': 'msedge',
    firefox: 'firefox',
    notepad: 'notepad',
    editor: 'notepad',
    rechner: 'calc',
    taschenrechner: 'calc',
    calculator: 'calc',
    explorer: 'explorer',
    dateimanager: 'explorer',
    dateien: 'explorer',
    terminal: 'powershell',
    powershell: 'powershell',
    eingabeaufforderung: 'cmd',
    cmd: 'cmd',
    einstellungen: 'ms-settings:',
    settings: 'ms-settings:',
    taskmanager: 'taskmgr',
    'task-manager': 'taskmgr',
    paint: 'mspaint',
    word: 'winword',
    excel: 'excel',
    powerpoint: 'powerpnt',
    outlook: 'outlook',
    spotify: 'spotify:',
    discord: 'discord:',
    steam: 'steam:',
    vscode: 'code',
    'visual studio code': 'code',
    teams: 'msteams:',
    zoom: 'zoommtg:',
    telegram: 'telegram:',
    whatsapp: 'whatsapp:',
  },
  darwin: {
    chrome: 'Google Chrome',
    'google chrome': 'Google Chrome',
    edge: 'Microsoft Edge',
    'microsoft edge': 'Microsoft Edge',
    firefox: 'Firefox',
    notepad: 'TextEdit',
    editor: 'TextEdit',
    rechner: 'Calculator',
    taschenrechner: 'Calculator',
    calculator: 'Calculator',
    explorer: 'Finder',
    dateimanager: 'Finder',
    dateien: 'Finder',
    terminal: 'Terminal',
    einstellungen: 'System Settings',
    settings: 'System Settings',
    taskmanager: 'Activity Monitor',
    'task-manager': 'Activity Monitor',
    paint: 'Preview',
    word: 'Microsoft Word',
    excel: 'Microsoft Excel',
    powerpoint: 'Microsoft PowerPoint',
    outlook: 'Microsoft Outlook',
    spotify: 'Spotify',
    discord: 'Discord',
    steam: 'Steam',
    vscode: 'Visual Studio Code',
    'visual studio code': 'Visual Studio Code',
    teams: 'Microsoft Teams',
    zoom: 'zoom.us',
  },
  linux: {
    chrome: 'google-chrome',
    'google chrome': 'google-chrome',
    edge: 'microsoft-edge',
    'microsoft edge': 'microsoft-edge',
    firefox: 'firefox',
    notepad: 'gedit',
    editor: 'gedit',
    rechner: 'gnome-calculator',
    taschenrechner: 'gnome-calculator',
    calculator: 'gnome-calculator',
    explorer: 'nautilus',
    dateimanager: 'nautilus',
    dateien: 'nautilus',
    terminal: 'x-terminal-emulator',
    einstellungen: 'gnome-control-center',
    settings: 'gnome-control-center',
    taskmanager: 'gnome-system-monitor',
    'task-manager': 'gnome-system-monitor',
    vscode: 'code',
    'visual studio code': 'code',
    spotify: 'spotify',
    discord: 'discord',
    steam: 'steam',
  },
};

/** "Rechner" → "calc" (Windows), unbekannte Namen bleiben unverändert. */
function resolveAppName(name, platform = process.platform) {
  const key = String(name ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^(den|die|das)\s+/, '')
    .trim();
  const table = APP_ALIASES[platform] || {};
  return table[key] || String(name ?? '').trim();
}

function openAppCommand(name, platform = process.platform) {
  const clean = String(name ?? '').trim();
  if (!clean || clean.length > 60 || !/^[\p{L}\p{N} ._:\-]+$/u.test(clean)) {
    return { error: 'invalid_name' };
  }
  const app = resolveAppName(clean, platform);
  if (platform === 'darwin') {
    return { command: 'open', args: ['-a', app], fallback: { command: 'open', args: [app] } };
  }
  if (platform === 'linux') {
    return { command: 'gtk-launch', args: [app], fallback: { command: app, args: [] } };
  }
  return {
    command: 'cmd.exe',
    args: ['/c', 'start', '""', `"${app}"`],
    windowsVerbatimArguments: true,
  };
}

/** Browser, die statt des Systemstandards gewählt werden können. */
const BROWSER_ALIASES = {
  win32: {
    chrome: 'chrome',
    edge: 'msedge',
    firefox: 'firefox',
    brave: 'brave',
    opera: 'opera',
    vivaldi: 'vivaldi',
  },
  darwin: {
    chrome: 'Google Chrome',
    edge: 'Microsoft Edge',
    firefox: 'Firefox',
    brave: 'Brave Browser',
    opera: 'Opera',
    vivaldi: 'Vivaldi',
  },
  linux: {
    chrome: 'google-chrome',
    edge: 'microsoft-edge',
    firefox: 'firefox',
    brave: 'brave-browser',
    opera: 'opera',
    vivaldi: 'vivaldi',
  },
};

const SUPPORTED_BROWSERS = ['chrome', 'edge', 'firefox', 'brave', 'opera', 'vivaldi'];

function safeUrl(value) {
  try {
    const url = new URL(String(value ?? '').trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    if (url.username || url.password) return '';
    return url.href;
  } catch {
    return '';
  }
}

/**
 * null bedeutet: Systemstandard (die App ruft dann shell.openExternal auf).
 * Ein unbekannter Browser fällt bewusst ebenfalls auf den Standard zurück,
 * damit ein alter Eintrag in den Einstellungen nichts blockiert.
 */
function openUrlCommand(url, browser, platform = process.platform) {
  const target = safeUrl(url);
  if (!target) return { error: 'invalid_url' };

  const wanted = String(browser ?? '').trim().toLowerCase();
  if (!wanted) return null;
  const app = (BROWSER_ALIASES[platform] || {})[wanted];
  if (!app) return null;

  if (platform === 'darwin') {
    return { command: 'open', args: ['-a', app, target], fallback: { command: 'open', args: [target] } };
  }
  if (platform === 'linux') {
    return { command: app, args: [target], fallback: { command: 'xdg-open', args: [target] } };
  }
  return {
    command: 'cmd.exe',
    args: ['/c', 'start', '""', `"${app}"`, `"${target}"`],
    windowsVerbatimArguments: true,
  };
}

/** Prozessnamen fürs Beenden unter Windows (erster Treffer gewinnt). */
const PROCESS_NAMES = {
  chrome: ['chrome.exe'],
  'google chrome': ['chrome.exe'],
  edge: ['msedge.exe'],
  'microsoft edge': ['msedge.exe'],
  firefox: ['firefox.exe'],
  notepad: ['notepad.exe'],
  editor: ['notepad.exe'],
  // Der Rechner heißt je nach Windows-Version anders.
  rechner: ['CalculatorApp.exe', 'Calculator.exe'],
  taschenrechner: ['CalculatorApp.exe', 'Calculator.exe'],
  calculator: ['CalculatorApp.exe', 'Calculator.exe'],
  explorer: ['explorer.exe'],
  dateimanager: ['explorer.exe'],
  dateien: ['explorer.exe'],
  terminal: ['WindowsTerminal.exe'],
  powershell: ['powershell.exe'],
  eingabeaufforderung: ['cmd.exe'],
  cmd: ['cmd.exe'],
  einstellungen: ['SystemSettings.exe'],
  settings: ['SystemSettings.exe'],
  taskmanager: ['Taskmgr.exe'],
  'task-manager': ['Taskmgr.exe'],
  paint: ['mspaint.exe'],
  word: ['WINWORD.EXE'],
  excel: ['EXCEL.EXE'],
  powerpoint: ['POWERPNT.EXE'],
  outlook: ['OUTLOOK.EXE'],
  spotify: ['Spotify.exe'],
  discord: ['Discord.exe'],
  steam: ['steam.exe'],
  vscode: ['Code.exe'],
  'visual studio code': ['Code.exe'],
  teams: ['ms-teams.exe', 'Teams.exe'],
  zoom: ['Zoom.exe'],
  telegram: ['Telegram.exe'],
  whatsapp: ['WhatsApp.exe'],
};

/**
 * Schließt ein laufendes Programm. Ohne /F, damit Windows den normalen
 * Schließen-Weg geht und offene Dokumente nachfragen können.
 */
function closeAppCommand(name, platform = process.platform) {
  const clean = String(name ?? '').trim();
  if (!clean || clean.length > 60 || !/^[\p{L}\p{N} ._:\-]+$/u.test(clean)) {
    return { error: 'invalid_name' };
  }

  const key = clean
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^(den|die|das)\s+/, '')
    .trim();

  if (platform === 'darwin') {
    const app = (APP_ALIASES.darwin || {})[key] || clean;
    return { command: 'osascript', args: ['-e', `tell application "${app}" to quit`] };
  }
  if (platform === 'linux') {
    const proc = (APP_ALIASES.linux || {})[key] || key.replace(/\s+/g, '-');
    return { command: 'pkill', args: ['-TERM', '-x', proc] };
  }

  const names = PROCESS_NAMES[key];
  if (!names) return { error: 'unknown_app' };
  const spec = { command: 'taskkill', args: ['/IM', names[0]] };
  if (names[1]) spec.fallback = { command: 'taskkill', args: ['/IM', names[1]] };
  return spec;
}

/**
 * Setzt die Systemlautstärke auf einen festen Prozentwert. Unter Windows
 * übernimmt das ein PowerShell-Skript mit der CoreAudio-Schnittstelle;
 * macOS und Linux haben dafür fertige Befehle.
 */
function setVolumeCommand(percent, scriptPath, platform = process.platform) {
  const raw = Number(percent);
  if (!Number.isFinite(raw)) return { error: 'invalid_level' };
  const level = Math.max(0, Math.min(100, Math.round(raw)));

  if (platform === 'darwin') {
    return { command: 'osascript', args: ['-e', `set volume output volume ${level}`] };
  }
  if (platform === 'linux') {
    return { command: 'pactl', args: ['set-sink-volume', '@DEFAULT_SINK@', `${level}%`] };
  }
  if (!scriptPath) return { error: 'missing_script' };
  return {
    command: 'powershell.exe',
    args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', String(scriptPath), String(level)],
  };
}

module.exports = {
  mediaCommand,
  volumeCommand,
  lockCommand,
  openAppCommand,
  openUrlCommand,
  closeAppCommand,
  setVolumeCommand,
  resolveAppName,
  safeUrl,
  SUPPORTED_BROWSERS,
};
