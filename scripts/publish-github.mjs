#!/usr/bin/env node
/**
 * Lädt den Alpha-Installer als Release-Asset in ein privates GitHub-Repo.
 *
 * Benötigt GITHUB_TOKEN (Fine-grained PAT):
 *   - Administration: Read and write  (nur nötig, wenn das Repo neu erstellt wird)
 *   - Contents: Read and write        (Release + Asset-Upload)
 *
 * Das Token wird nie ausgegeben oder geschrieben.
 */
import { createReadStream, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const repoName = process.env.GH_REPO || 'jarvis-alpha';
const tag = process.env.GH_TAG || 'v0.1.0-alpha.1';
const releaseName = process.env.GH_RELEASE_NAME || 'J.A.R.V.I.S. Alpha 0.1.0';
const assetPath = process.env.GH_ASSET || join(root, 'release', 'JARVIS-Alpha-0.1.0-alpha.1-win-x64-Setup.exe');
const api = (process.env.GH_API_BASE || 'https://api.github.com').replace(/\/+$/, '');
const uploads = (process.env.GH_UPLOAD_BASE || 'https://uploads.github.com').replace(/\/+$/, '');

if (!token) {
  console.error('[publish] GITHUB_TOKEN fehlt. Lege ihn unter Settings → Project settings → Secrets an.');
  process.exit(2);
}

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'jarvis-publish',
};

async function call(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    const message = data && typeof data === 'object' ? data.message : String(data ?? '');
    throw new Error(`${options.method || 'GET'} ${url} → ${response.status} ${message}`.trim());
  }
  return data;
}

function requireFile() {
  const stats = statSync(assetPath);
  if (!stats.isFile()) throw new Error(`Kein Asset gefunden: ${assetPath}`);
  return stats.size;
}

async function resolveRepo(login) {
  try {
    return await call(`${api}/repos/${login}/${repoName}`);
  } catch (error) {
    if (!String(error.message).includes('404')) throw error;
  }

  console.log(`[publish] Repo ${login}/${repoName} existiert nicht – wird privat angelegt.`);
  return call(`${api}/user/repos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: repoName,
      private: true,
      description: 'J.A.R.V.I.S. – lokaler Sprachassistent (privater Alpha-Build)',
      has_issues: false,
      has_wiki: false,
      auto_init: false,
    }),
  });
}

async function getOrCreateRelease(repo) {
  const existing = await call(`${api}/repos/${repo.full_name}/releases/tags/${tag}`).catch((error) => {
    if (String(error.message).includes('404')) return null;
    throw error;
  });
  if (existing) {
    console.log(`[publish] Release ${tag} existiert bereits (id ${existing.id}).`);
    return existing;
  }

  const created = await call(`${api}/repos/${repo.full_name}/releases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tag_name: tag,
      name: releaseName,
      body:
        'Privater Alpha-Build des J.A.R.V.I.S. Sprachassistenten.\n\n' +
        'Unsigned Windows-x64-Installer. Nur für den internen Test gedacht.',
      draft: false,
      prerelease: true,
    }),
  });
  console.log(`[publish] Release ${tag} angelegt (id ${created.id}).`);
  return created;
}

async function uploadAsset(repo, release, size) {
  const name = basename(assetPath);
  const assets = await call(`${api}/repos/${repo.full_name}/releases/${release.id}/assets`);
  const stale = assets.find((asset) => asset.name === name);
  if (stale) {
    console.log('[publish] Altes Asset wird ersetzt.');
    await call(`${api}/repos/${repo.full_name}/releases/assets/${stale.id}`, { method: 'DELETE' });
  }

  console.log(`[publish] Lade ${name} (${(size / 1024 / 1024).toFixed(1)} MB) hoch …`);
  const url = `${uploads}/repos/${repo.full_name}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(size),
    },
    body: createReadStream(assetPath),
    duplex: 'half',
  });
  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  if (!response.ok || !data?.browser_download_url) {
    throw new Error(`Upload → ${response.status} ${data?.message ?? text.slice(0, 200)}`);
  }
  return data;
}

async function main() {
  const size = requireFile();
  const user = await call(`${api}/user`);
  console.log(`[publish] Angemeldet als ${user.login}.`);

  const repo = await resolveRepo(user.login);
  if (!repo.private) console.log('[publish] Hinweis: Das Repo ist öffentlich.');

  const release = await getOrCreateRelease(repo);
  const asset = await uploadAsset(repo, release, size);

  console.log(
    JSON.stringify(
      {
        repo: repo.html_url,
        private: repo.private,
        release: release.html_url,
        download: asset.browser_download_url,
        asset: asset.name,
        size: asset.size,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(`[publish] Fehlgeschlagen: ${error.message}`);
  process.exit(1);
});
