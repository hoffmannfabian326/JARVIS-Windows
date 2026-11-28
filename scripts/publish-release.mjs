#!/usr/bin/env node
/**
 * Lädt Installer, latest.yml und Blockmap in ein Release-Repo, aus dem die App
 * ohne Token aktualisieren kann. Das Repo muss öffentlich sein: Anhänge
 * privater Repos brauchen ein Token, das sonst auslesbar in der App läge.
 *
 * Benötigt GITHUB_TOKEN (Fine-grained PAT, Contents: Read and write).
 * Optional: GH_RELEASES_REPO, GH_TAG, GH_REPO_PRIVATE=1.
 */
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const repoName = process.env.GH_RELEASES_REPO || 'JARVIS-Windows';
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const tag = process.env.GH_TAG || `v${version}`;
const releaseDir = join(root, 'release');
const api = 'https://api.github.com';
const uploads = 'https://uploads.github.com';

if (!token) {
  console.error('[release] GITHUB_TOKEN fehlt (Contents: Read and write).');
  process.exit(2);
}

const manifestPath = join(releaseDir, 'latest.yml');
if (!existsSync(manifestPath)) {
  console.error('[release] release/latest.yml fehlt — zuerst "npm run release:dry" ausführen.');
  process.exit(1);
}

const manifest = readFileSync(manifestPath, 'utf8');
if (!new RegExp(`^version:\\s*${version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm').test(manifest)) {
  console.error(`[release] latest.yml passt nicht zu Version ${version}.`);
  process.exit(1);
}

const setup = `JARVIS-Alpha-${version}-win-x64-Setup.exe`;
const assets = [join(releaseDir, setup), join(releaseDir, `${setup}.blockmap`), manifestPath].filter(
  (file) => existsSync(file),
);

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'jarvis-release',
};

async function call(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${url} → ${response.status} ${data?.message ?? ''}`.trim());
  }
  return data;
}

async function upload(repo, release, file) {
  const name = basename(file);
  const size = statSync(file).size;
  const existing = await call(`${api}/repos/${repo.full_name}/releases/${release.id}/assets`);
  const stale = existing.find((entry) => entry.name === name);
  if (stale) {
    await call(`${api}/repos/${repo.full_name}/releases/assets/${stale.id}`, { method: 'DELETE' });
  }

  console.log(`[release] ${name} (${(size / 1024 / 1024).toFixed(1)} MB) …`);
  const response = await fetch(
    `${uploads}/repos/${repo.full_name}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`,
    {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(size),
      },
      body: createReadStream(file),
      duplex: 'half',
    },
  );
  if (!response.ok) {
    throw new Error(`Upload ${name} → ${response.status} ${(await response.text()).slice(0, 200)}`);
  }
}

async function main() {
  // Im Workflow darf GITHUB_TOKEN /user nicht lesen (403). Deshalb zuerst die
  // Repo-Angaben aus der Umgebung, /user nur als Rückfall für lokale Läufe.
  const owners = [process.env.GH_OWNER, (process.env.GITHUB_REPOSITORY || '').split('/')[0]]
    .filter(Boolean)
    .filter((owner, index, all) => all.indexOf(owner) === index);
  if (owners.length === 0) owners.push((await call(`${api}/user`)).login);

  for (const owner of owners) {
    const repo = await call(`${api}/repos/${owner}/${repoName}`).catch((error) => {
      if (String(error.message).includes('404')) return null;
      throw error;
    });
    if (!repo) continue;

    if (repo.private && process.env.GH_REPO_PRIVATE !== '1') {
      console.error(
        `[release] ${repo.full_name} ist privat. Der Updater kann ohne Token nicht laden.\n` +
          '          Repo öffentlich machen oder GH_RELEASES_REPO auf ein öffentliches Release-Repo setzen.',
      );
      process.exit(3);
    }

    const release = await call(`${api}/repos/${repo.full_name}/releases/tags/${tag}`).catch((error) => {
      if (!String(error.message).includes('404')) throw error;
      return call(`${api}/repos/${repo.full_name}/releases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tag_name: tag,
          name: `J.A.R.V.I.S. ${version}`,
          body: `Alpha-Build ${version}.`,
          draft: false,
          // Wichtig: /releases/latest/download löst nur reguläre Releases auf.
          prerelease: false,
        }),
      });
    });

    for (const file of assets) await upload(repo, release, file);
    console.log(`[release] fertig: ${repo.html_url}/releases/tag/${tag}`);
    return;
  }

  console.error(`[release] Repo ${repoName} nicht gefunden. Lege es an oder setze GH_RELEASES_REPO.`);
  process.exit(1);
}

main().catch((error) => {
  console.error(`[release] Fehlgeschlagen: ${error.message}`);
  process.exit(1);
});
