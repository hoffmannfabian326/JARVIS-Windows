'use strict';

/**
 * Lokale Spieleerkennung für den Gaming Hub.
 *
 * Liest ausschließlich offizielle Launcher-Dateien und lokale Registry-Einträge.
 * Es werden keine Schutzmechanismen umgangen und keine Prozesse verändert.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

const MAX_GAMES = 320;
const MAX_MANIFESTS = 400;
const LAUNCHER_LABEL = {
  steam: 'Steam',
  epic: 'Epic Games',
  battlenet: 'Battle.net',
  gog: 'GOG',
  ubisoft: 'Ubisoft Connect',
  ea: 'EA App',
};

function cleanName(value, fallback = 'Unbekanntes Spiel') {
  const name = String(value ?? '')
    .replace(/[™®©]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return name.slice(0, 90) || fallback;
}

function safeId(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

function processName(exe) {
  return path
    .basename(String(exe ?? '').replace(/\\/g, '/'))
    .replace(/\.exe$/i, '')
    .toLowerCase()
    .replace(/[_\s]+/g, ' ')
    .trim();
}

function exists(file) {
  try {
    return Boolean(file) && fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

function directoryExists(dir) {
  try {
    return Boolean(dir) && fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function unescapeVdf(value) {
  return String(value ?? '').replace(/\\\\/g, '\\');
}

/** Liest die Bibliotheksordner aus libraryfolders.vdf. */
function parseLibraryFolders(text) {
  const paths = [];
  for (const match of String(text ?? '').matchAll(/"path"\s+"((?:[^"\\]|\\.)*)"/g)) {
    const entry = unescapeVdf(match[1]).trim();
    if (entry) paths.push(entry);
  }
  return [...new Set(paths)];
}

/** Liest ein appmanifest_*.acf ohne externe VDF-Abhängigkeit. */
function parseAcf(text) {
  const read = (key) => {
    const match = new RegExp(`"${key}"\\s+"([^"]*)"`, 'i').exec(String(text ?? ''));
    return match ? match[1] : '';
  };
  return {
    appid: read('appid'),
    name: read('name'),
    installdir: read('installdir'),
    stateFlags: read('StateFlags'),
    sizeOnDisk: Number(read('SizeOnDisk')) || 0,
  };
}

function findExecutable(dir, names = []) {
  if (!directoryExists(dir)) return '';
  for (const name of names) {
    const candidate = path.join(dir, name);
    if (exists(candidate)) return candidate;
  }
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile() && /\.exe$/i.test(entry.name))
      .map((entry) => entry.name)
      .filter((name) => !/^(unins|setup|install|redist|vc_redist|launcher|eadesktop|ubisoftconnect|galaxyclient)/i.test(name));
    if (!files.length) return '';
    files.sort((a, b) => b.length - a.length);
    return path.join(dir, files[0]);
  } catch {
    return '';
  }
}

function powershellJson(script, timeout = 12_000) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve(null);
      return;
    }
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
      { timeout, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          resolve(null);
          return;
        }
        try {
          resolve(JSON.parse(String(stdout ?? '').replace(/^\uFEFF/, '').trim()));
        } catch {
          resolve(null);
        }
      },
    );
  });
}

function registryScript() {
  return [
    "$ErrorActionPreference='SilentlyContinue'",
    '$out=[ordered]@{steam=$null;gog=@();ubisoft=@();ea=@();battlenet=$null}',
    "$p=Get-ItemProperty 'HKCU:\\Software\\Valve\\Steam'",
    'if($p){$out.steam=$p.SteamPath}',
    "$keys=Get-ChildItem 'HKLM:\\SOFTWARE\\WOW6432Node\\GOG.com\\Games' -ErrorAction SilentlyContinue",
    'foreach($k in $keys){$v=Get-ItemProperty $k.PSPath; $out.gog += [pscustomobject]@{id=$k.PSChildName;name=$v.gameName;path=$v.path;exe=$v.exe;command=$v.launchCommand}}',
    "$keys=Get-ChildItem 'HKLM:\\SOFTWARE\\WOW6432Node\\Ubisoft\\Launcher\\Installs' -ErrorAction SilentlyContinue",
    'foreach($k in $keys){$v=Get-ItemProperty $k.PSPath; $out.ubisoft += [pscustomobject]@{id=$k.PSChildName;dir=$v.InstallDir}}',
    "$keys=Get-ChildItem 'HKLM:\\SOFTWARE\\WOW6432Node\\EA Games' -ErrorAction SilentlyContinue",
    'foreach($k in $keys){$v=Get-ItemProperty $k.PSPath; $out.ea += [pscustomobject]@{id=$k.PSChildName;dir=$v.\"Install Dir\";content=$v.ContentID}}',
    '$out | ConvertTo-Json -Depth 6 -Compress',
  ].join('\n');
}

function steamLibraryRoots(registrySteam) {
  const roots = [];
  const candidates = [
    registrySteam,
    process.env['ProgramFiles(x86)'] ? path.join(process.env['ProgramFiles(x86)'], 'Steam') : '',
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'Steam') : '',
  ];
  for (const candidate of candidates) {
    if (candidate && directoryExists(candidate)) roots.push(candidate);
  }
  const primary = roots[0];
  if (!primary) return [];
  const foldersFile = path.join(primary, 'steamapps', 'libraryfolders.vdf');
  let folders = [];
  try {
    folders = parseLibraryFolders(fs.readFileSync(foldersFile, 'utf8'));
  } catch {
    /* Bibliotheksdatei fehlt */
  }
  for (const folder of folders) {
    if (directoryExists(folder)) roots.push(folder);
  }
  return [...new Set(roots)];
}

function detectSteam(registrySteam, errors) {
  const games = [];
  const roots = steamLibraryRoots(registrySteam);
  for (const root of roots) {
    const steamapps = path.join(root, 'steamapps');
    let files = [];
    try {
      files = fs.readdirSync(steamapps).filter((name) => /^appmanifest_\d+\.acf$/i.test(name)).slice(0, MAX_MANIFESTS);
    } catch {
      continue;
    }
    for (const file of files) {
      try {
        const acf = parseAcf(fs.readFileSync(path.join(steamapps, file), 'utf8'));
        if (!acf.appid || !acf.name) continue;
        if (/steamworks common redistributables|steamvr|proton|steam linux runtime/i.test(acf.name)) continue;
        if (acf.stateFlags && !(Number(acf.stateFlags) & 4)) continue;
        const id = `steam-${acf.appid}`;
        games.push({
          id,
          name: cleanName(acf.name),
          launcher: 'steam',
          source: 'detected',
          kind: 'game',
          steamAppId: acf.appid,
          uri: `steam://rungameid/${acf.appid}`,
          installDir: acf.installdir ? path.join(steamapps, 'common', acf.installdir) : '',
          coverUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${acf.appid}/header.jpg`,
          heroUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${acf.appid}/library_hero.jpg`,
          genre: '',
          description: '',
          favorite: false,
          playtimeSeconds: 0,
          lastPlayedAt: 0,
          addedAt: Date.now(),
        });
      } catch (error) {
        errors.push(`Steam-Manifest ${file}: ${String(error?.message ?? error).slice(0, 100)}`);
      }
    }
  }
  return games;
}

function findFirstFile(dir, extensions, depth = 2) {
  if (!directoryExists(dir) || depth < 0) return '';
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isFile() && extensions.some((ext) => entry.name.toLowerCase().endsWith(ext))) return full;
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !/^(\.git|node_modules|__pycache__)$/i.test(entry.name)) {
        const found = findFirstFile(path.join(dir, entry.name), extensions, depth - 1);
        if (found) return found;
      }
    }
  } catch {
    /* nicht lesbar */
  }
  return '';
}

function readEpicManifest(installDir, appName) {
  const egstore = path.join(installDir, '.egstore');
  let itemFile = findFirstFile(egstore, ['.item'], 0);
  if (!itemFile) itemFile = findFirstFile(egstore, ['.item'], 2);
  const item = itemFile ? readJson(itemFile) : null;
  return {
    name: cleanName(item?.DisplayName || appName.split('').join(''), 'Epic-Spiel'),
    executable: item?.LaunchExecutable ? path.join(installDir, item.LaunchExecutable) : '',
    appName: item?.AppName || appName,
  };
}

function detectEpic(errors) {
  const programData = process.env.ProgramData || 'C:\\ProgramData';
  const file = path.join(programData, 'Epic', 'UnrealEngineLauncher', 'LauncherInstalled.dat');
  const root = readJson(file);
  const games = [];
  for (const entry of Array.isArray(root?.InstallationList) ? root.InstallationList.slice(0, MAX_GAMES) : []) {
    if (!entry?.InstallLocation || !entry?.AppName) continue;
    try {
      const manifest = readEpicManifest(entry.InstallLocation, entry.AppName);
      if (/^(ue|unreal engine)/i.test(manifest.name)) continue;
      games.push({
        id: `epic-${safeId(manifest.appName)}`,
        name: manifest.name,
        launcher: 'epic',
        source: 'detected',
        kind: 'game',
        epicAppName: manifest.appName,
        installDir: entry.InstallLocation,
        exe: manifest.executable && exists(manifest.executable) ? manifest.executable : undefined,
        uri: `com.epicgames.launcher://apps/${encodeURIComponent(manifest.appName)}?action=launch&silent=true`,
        process: manifest.executable ? processName(manifest.executable) : undefined,
        genre: '',
        description: '',
        favorite: false,
        playtimeSeconds: 0,
        lastPlayedAt: 0,
        addedAt: Date.now(),
      });
    } catch (error) {
      errors.push(`Epic-Eintrag: ${String(error?.message ?? error).slice(0, 100)}`);
    }
  }
  return games;
}

function detectGog(registry, errors) {
  const games = [];
  for (const entry of Array.isArray(registry?.gog) ? registry.gog.slice(0, MAX_GAMES) : []) {
    const dir = String(entry.path ?? '').trim();
    const exe = String(entry.exe ?? '').trim();
    const fullExe = exe ? (path.isAbsolute(exe) ? exe : path.join(dir, exe)) : findExecutable(dir, []);
    if (!dir && !fullExe) continue;
    games.push({
      id: `gog-${safeId(entry.id || entry.name)}`,
      name: cleanName(entry.name, 'GOG-Spiel'),
      launcher: 'gog',
      source: 'detected',
      kind: 'game',
      installDir: dir,
      exe: fullExe && exists(fullExe) ? fullExe : undefined,
      process: fullExe ? processName(fullExe) : undefined,
      genre: '',
      description: '',
      favorite: false,
      playtimeSeconds: 0,
      lastPlayedAt: 0,
      addedAt: Date.now(),
    });
  }
  return games;
}

function detectUbisoft(registry) {
  const games = [];
  for (const entry of Array.isArray(registry?.ubisoft) ? registry.ubisoft.slice(0, MAX_GAMES) : []) {
    const dir = String(entry.dir ?? '').trim();
    if (!dir) continue;
    const exe = findExecutable(dir, []);
    games.push({
      id: `ubisoft-${safeId(entry.id)}`,
      name: cleanName(entry.id, 'Ubisoft-Spiel'),
      launcher: 'ubisoft',
      source: 'detected',
      kind: 'game',
      installDir: dir,
      exe: exe && exists(exe) ? exe : undefined,
      process: exe ? processName(exe) : undefined,
      uri: `uplay://launch/${encodeURIComponent(entry.id)}/0`,
      genre: '',
      description: '',
      favorite: false,
      playtimeSeconds: 0,
      lastPlayedAt: 0,
      addedAt: Date.now(),
    });
  }
  return games;
}

function detectEa(registry) {
  const games = [];
  for (const entry of Array.isArray(registry?.ea) ? registry.ea.slice(0, MAX_GAMES) : []) {
    const dir = String(entry.dir ?? '').trim();
    if (!dir) continue;
    const exe = findExecutable(dir, []);
    games.push({
      id: `ea-${safeId(entry.id)}`,
      name: cleanName(entry.id, 'EA-Spiel'),
      launcher: 'ea',
      source: 'detected',
      kind: 'game',
      installDir: dir,
      exe: exe && exists(exe) ? exe : undefined,
      process: exe ? processName(exe) : undefined,
      genre: '',
      description: '',
      favorite: false,
      playtimeSeconds: 0,
      lastPlayedAt: 0,
      addedAt: Date.now(),
    });
  }
  return games;
}

function detectBattleNet(errors) {
  const programFiles = process.env['ProgramFiles(x86)'] || process.env.ProgramFiles || 'C:\\Program Files (x86)';
  const roots = [
    path.join(programFiles, 'World of Warcraft'),
    path.join(programFiles, 'World of Warcraft', '_retail_'),
    path.join(programFiles, 'World of Warcraft', '_classic_'),
    path.join(programFiles, 'World of Warcraft', '_classic_era_'),
  ];
  const wowRoot = roots.find((dir) => directoryExists(dir) && (dir.endsWith('_retail_') || dir.endsWith('_classic_') || dir.endsWith('_classic_era_')));
  const gameDir = wowRoot || (directoryExists(path.join(programFiles, 'World of Warcraft')) ? path.join(programFiles, 'World of Warcraft', '_retail_') : '');
  const exe = gameDir ? path.join(gameDir, 'Wow.exe') : '';
  if (!exe || !exists(exe)) {
    if (gameDir) errors.push('World-of-Warcraft-Ordner gefunden, aber Wow.exe fehlt.');
    return [];
  }
  const classic = /_classic|_classic_era_/i.test(gameDir);
  return [
    {
      id: classic ? 'battlenet-wow-classic' : 'battlenet-wow-retail',
      name: classic ? 'World of Warcraft · Classic' : 'World of Warcraft',
      launcher: 'battlenet',
      source: 'detected',
      kind: 'game',
      installDir: gameDir,
      exe,
      process: 'wow',
      genre: 'MMORPG',
      description: '',
      favorite: false,
      playtimeSeconds: 0,
      lastPlayedAt: 0,
      addedAt: Date.now(),
    },
  ];
}

function launcherPaths(registry) {
  const programFiles = process.env['ProgramFiles(x86)'] || process.env.ProgramFiles || 'C:\\Program Files (x86)';
  const programData = process.env.ProgramData || 'C:\\ProgramData';
  const battleNet = path.join(programFiles, 'Battle.net', 'Battle.net.exe');
  const gog = path.join(programFiles, 'GOG Galaxy', 'GalaxyClient.exe');
  const ubisoft = path.join(programFiles, 'Ubisoft', 'Ubisoft Connect', 'UbisoftConnect.exe');
  const ea = path.join(programFiles, 'Electronic Arts', 'EA Desktop', 'EA Desktop', 'EADesktop.exe');
  return [
    { id: 'steam', label: 'Steam', detected: Boolean(registry?.steam), path: String(registry?.steam || '') },
    {
      id: 'epic',
      label: 'Epic Games',
      detected: exists(path.join(programData, 'Epic', 'UnrealEngineLauncher', 'LauncherInstalled.dat')),
      path: path.join(programData, 'Epic', 'UnrealEngineLauncher', 'LauncherInstalled.dat'),
    },
    { id: 'battlenet', label: 'Battle.net', detected: exists(battleNet), path: battleNet },
    { id: 'gog', label: 'GOG', detected: exists(gog), path: gog },
    { id: 'ubisoft', label: 'Ubisoft Connect', detected: exists(ubisoft), path: ubisoft },
    { id: 'ea', label: 'EA App', detected: exists(ea), path: ea },
  ];
}

function dedupe(games) {
  const priority = { steam: 0, epic: 1, gog: 2, ubisoft: 3, ea: 4, battlenet: 5, manual: 6, custom: 7 };
  const byKey = new Map();
  for (const game of games) {
    const key = `${game.name.toLowerCase()}|${game.launcher}`;
    const current = byKey.get(key);
    if (!current || (priority[game.launcher] ?? 9) < (priority[current.launcher] ?? 9)) byKey.set(key, game);
  }
  return [...byKey.values()].slice(0, MAX_GAMES);
}

async function detectInstalledGames() {
  if (process.platform !== 'win32') {
    return {
      supported: false,
      games: [],
      launchers: [],
      errors: [],
      message: 'Die automatische Spieleerkennung ist unter Windows verfügbar.',
    };
  }
  const errors = [];
  const registry = await powershellJson(registryScript());
  if (!registry) errors.push('Launcher-Registry konnte nicht gelesen werden.');
  const groups = [
    detectSteam(String(registry?.steam ?? ''), errors),
    detectEpic(errors),
    detectGog(registry, errors),
    detectUbisoft(registry),
    detectEa(registry),
    detectBattleNet(errors),
  ];
  const games = dedupe(groups.flat());
  for (const game of games) {
    if (game.exe && !exists(game.exe)) game.available = false;
  }
  return {
    supported: true,
    games,
    launchers: launcherPaths(registry),
    errors: errors.slice(0, 8),
    message: games.length
      ? `${games.length} Spiele in lokalen Launcher-Bibliotheken gefunden.`
      : 'Keine installierten Spiele in den unterstützten Launchern gefunden.',
  };
}

module.exports = {
  detectInstalledGames,
  _internals: {
    parseLibraryFolders,
    parseAcf,
    processName,
    dedupe,
    safeId,
    cleanName,
  },
};
