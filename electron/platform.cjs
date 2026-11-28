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

function openAppCommand(name, platform = process.platform) {
  const clean = String(name ?? '').trim();
  if (!clean || clean.length > 60 || !/^[\p{L}\p{N} ._:\-]+$/u.test(clean)) {
    return { error: 'invalid_name' };
  }
  if (platform === 'darwin') {
    return { command: 'open', args: ['-a', clean], fallback: { command: 'open', args: [clean] } };
  }
  if (platform === 'linux') {
    return { command: 'gtk-launch', args: [clean], fallback: { command: clean, args: [] } };
  }
  return {
    command: 'cmd.exe',
    args: ['/c', 'start', '""', `"${clean}"`],
    windowsVerbatimArguments: true,
  };
}

module.exports = {
  mediaCommand,
  volumeCommand,
  lockCommand,
  openAppCommand,
};
