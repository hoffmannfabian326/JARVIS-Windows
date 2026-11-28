import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

/** Sucht makensis in PATH oder im electron-builder-Cache (Linux/macOS). */
function findMakensis() {
  if (process.env.MAKENSIS) return process.env.MAKENSIS;

  try {
    execFileSync('makensis', ['-VERSION'], { stdio: 'ignore' });
    return 'makensis';
  } catch {
    /* weiter suchen */
  }

  const cache = join(homedir(), '.cache', 'electron-builder');
  if (!existsSync(cache)) return null;

  const walk = (dir, depth) => {
    if (depth > 5) return null;
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      let info;
      try {
        info = statSync(full);
      } catch {
        continue;
      }
      if (info.isDirectory()) {
        const found = walk(full, depth + 1);
        if (found) return found;
      } else if (entry === 'makensis') {
        return full;
      }
    }
    return null;
  };

  return walk(cache, 0);
}

const makensis = findMakensis();
if (!makensis) {
  console.error('makensis nicht gefunden. Installiere NSIS oder setze MAKENSIS=/pfad/zu/makensis.');
  process.exit(1);
}

if (!existsSync(join('release', 'win-unpacked'))) {
  console.error('release/win-unpacked fehlt — zuerst "electron-builder --win --dir" ausführen.');
  process.exit(1);
}

console.log(`[installer] makensis: ${makensis}`);

// Der Linux-Build aus dem electron-builder-Cache findet seine Stubs nur mit
// gesetztem NSISDIR (er leitet den Pfad sonst vom aufrufenden Prozess ab).
const env = { ...process.env };
if (makensis.includes(join('.cache', 'electron-builder'))) {
  env.NSISDIR = resolve(dirname(makensis), '..');
}

execFileSync(makensis, ['-V2', 'build/installer-split.nsi'], { stdio: 'inherit', env });
console.log('[installer] fertig: release/JARVIS-Alpha-0.1.0-alpha.2-win-x64-Setup.exe');
