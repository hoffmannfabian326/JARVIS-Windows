'use strict';

const fs = require('node:fs');

const DEFAULT_VOICE_ID = 'mdy0XxrJgPxKAMK5Wexl';
const DEFAULT_MODEL_ID = 'eleven_flash_v2_5';
const DEFAULT_API_BASE = 'https://api.elevenlabs.io/v1';

let config = { envFile: null, apiBase: DEFAULT_API_BASE };

function configure(next = {}) {
  if (next.envFile) config.envFile = String(next.envFile);
  if (next.apiBase) config.apiBase = String(next.apiBase).replace(/\/+$/, '');
}

/** Liest nur die .env des Nutzers; Werte bleiben im Main-Prozess. */
function readEnvFile() {
  if (!config.envFile) return {};
  try {
    const values = {};
    for (const raw of fs.readFileSync(config.envFile, 'utf8').split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      values[key] = value;
    }
    return values;
  } catch {
    return {};
  }
}

/** Jeder Aufruf liest frisch, damit ein neuer Key ohne Neustart greift. */
function settings() {
  const env = readEnvFile();
  const read = (name, fallback) => process.env[name] || env[name] || fallback;
  return {
    key: read('ELEVENLABS_API_KEY', ''),
    voiceId: read('ELEVENLABS_VOICE_ID', DEFAULT_VOICE_ID),
    modelId: read('ELEVENLABS_MODEL_ID', DEFAULT_MODEL_ID),
    apiBase: read('ELEVENLABS_API_BASE', config.apiBase).replace(/\/+$/, ''),
  };
}

function available() {
  return Boolean(settings().key);
}

function info() {
  const { voiceId } = settings();
  return {
    available: available(),
    engine: 'elevenlabs',
    voice: 'ElevenLabs (Cloud)',
    model: voiceId,
  };
}

/** Formatiert eine Fehlerantwort als "status: message (HTTP xxx)". */
function describeResponse(status, data) {
  const detail = data?.detail;
  let text = '';
  if (typeof detail === 'string') text = detail;
  else if (detail && typeof detail === 'object') {
    text = [detail.status, detail.message].filter(Boolean).join(': ');
  }
  return text ? `${text} (HTTP ${status})` : `HTTP ${status}`;
}

/** Erklärt die wichtigsten HTTP-Antworten in einem konkreten nächsten Schritt. */
function hintForStatus(status, data) {
  const code = String(data?.detail?.status ?? '');
  if (status === 401) {
    return /missing_permission/i.test(code)
      ? 'Der Key ist gültig, ihm fehlt aber das Leserecht. In ElevenLabs → Developers einen Key mit allen Rechten erzeugen.'
      : 'Key ungültig oder widerrufen. In ElevenLabs → Developers → API Keys neu erzeugen; den vollständigen Wert (beginnt mit sk_) einmal kopieren und in den Einstellungen eintragen.';
  }
  if (status === 403) {
    return 'Dem Key fehlt die Berechtigung für diese Anfrage. Die Rechte des Keys in ElevenLabs prüfen.';
  }
  if (status === 404) {
    return 'Stimmen-ID unbekannt. In ElevenLabs → My Voices die Stimme öffnen, „Copy voice ID“ wählen und die ID in den Einstellungen eintragen.';
  }
  if (status === 402) {
    return 'Guthaben oder Kontingent aufgebraucht. Im ElevenLabs-Konto aufladen oder Piper lokal nutzen — Piper kostet nichts.';
  }
  if (status === 429) {
    return 'Zu viele Anfragen in kurzer Zeit. Eine Minute warten und erneut prüfen.';
  }
  if (status >= 500) {
    return 'ElevenLabs meldet einen Serverfehler. Später erneut prüfen; Piper spricht solange lokal.';
  }
  return 'Piper bleibt als lokale Stimme aktiv; Details stehen im Fehlerprotokoll.';
}

/** Kleine GET-Anfrage mit Key; liefert Status und geparste JSON-Antwort. */
async function requestJson(url, key, timeoutMs) {
  const response = await fetch(url, {
    headers: { 'xi-api-key': key, Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  let data = null;
  try {
    data = await response.json();
  } catch {
    /* Antwort war kein JSON */
  }
  return { ok: response.ok, status: response.status, data };
}

/**
 * Live-Test für das Fehlerprogramm: prüft Key, Kontingent und Stimmen-ID, ohne
 * Audio anzufordern — es werden also keine Zeichen verbraucht. 401/404/402
 * werden getrennt gemeldet, damit die Ursache ohne Synthese-Versuch sichtbar ist.
 */
async function test({ timeoutMs = 12000 } = {}) {
  const { key, voiceId, modelId, apiBase } = settings();
  const at = Date.now();
  const checks = [];
  const fail = (id, label, detail, hint) => checks.push({ id, label, status: 'fail', detail, hint });

  if (!key) {
    fail(
      'key',
      'API-Key',
      'kein ELEVENLABS_API_KEY hinterlegt',
      'Key in den Einstellungen unter Zugangsdaten eintragen; Piper bleibt als lokale Stimme aktiv.',
    );
    return {
      ok: false,
      at,
      voiceId,
      modelId,
      apiBase,
      checks,
      summary: 'Nicht bereit: kein API-Key',
    };
  }

  let keyWorks = false;
  try {
    const result = await requestJson(`${apiBase}/user/subscription`, key, timeoutMs);
    if (result.ok) {
      keyWorks = true;
      const limit = Math.max(0, Number(result.data?.character_limit) || 0);
      const used = Math.max(0, Number(result.data?.character_count) || 0);
      const left = Math.max(0, limit - used);
      const empty = limit > 0 && left <= 0;
      checks.push({
        id: 'key',
        label: 'API-Key',
        status: empty ? 'warn' : 'ok',
        detail: empty
          ? `Key gültig, aber Kontingent erschöpft (${used.toLocaleString('de-DE')} von ${limit.toLocaleString('de-DE')} Zeichen)`
          : `Key gültig${limit ? ` · ${left.toLocaleString('de-DE')} von ${limit.toLocaleString('de-DE')} Zeichen frei` : ''}`,
        hint: empty ? 'Weitere Aufrufe enden mit 402. Guthaben aufladen oder Piper lokal nutzen.' : undefined,
      });
    } else {
      // 401 mit fehlendem Leserecht heißt: Key gilt, darf das Konto aber nicht lesen.
      const limited =
        result.status === 401 && /missing_permission/i.test(String(result.data?.detail?.status ?? ''));
      keyWorks = limited;
      checks.push({
        id: 'key',
        label: 'API-Key',
        status: limited ? 'warn' : 'fail',
        detail: limited
          ? 'Key vorhanden, aber ohne Leserecht für das Konto'
          : describeResponse(result.status, result.data),
        hint: hintForStatus(result.status, result.data),
      });
    }
  } catch (error) {
    const timeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    fail(
      'key',
      'API-Key',
      timeout
        ? 'Zeitüberschreitung bei api.elevenlabs.io'
        : `Anfrage fehlgeschlagen: ${error?.message ?? 'Fehler'}`,
      'Internetverbindung, Firewall oder Proxy prüfen; Piper spricht lokal weiter.',
    );
  }

  // Ohne gültigen Key wäre ein 404 auf die Stimme nur ein Folgefehler.
  if (keyWorks) {
    try {
      const result = await requestJson(`${apiBase}/voices/${encodeURIComponent(voiceId)}`, key, timeoutMs);
      if (result.ok) {
        const name =
          typeof result.data?.name === 'string' && result.data.name ? `„${result.data.name}“` : voiceId;
        const category = typeof result.data?.category === 'string' ? ` · ${result.data.category}` : '';
        checks.push({
          id: 'voice',
          label: 'Stimmen-ID',
          status: 'ok',
          detail: `${name}${category}`,
          hint: `ID: ${voiceId}`,
        });
      } else {
        fail(
          'voice',
          'Stimmen-ID',
          `${voiceId}: ${describeResponse(result.status, result.data)}`,
          hintForStatus(result.status, result.data),
        );
      }
    } catch (error) {
      const timeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
      fail(
        'voice',
        'Stimmen-ID',
        timeout
          ? 'Zeitüberschreitung bei api.elevenlabs.io'
          : `Anfrage fehlgeschlagen: ${error?.message ?? 'Fehler'}`,
        'Internetverbindung, Firewall oder Proxy prüfen; Piper spricht lokal weiter.',
      );
    }
  }

  const problems = checks.filter((check) => check.status === 'fail');
  const warnings = checks.filter((check) => check.status === 'warn');
  const summary = problems.length
    ? `Nicht bereit: ${problems.map((check) => check.label).join(', ')}`
    : warnings.length
      ? `Bereit mit Hinweis: ${warnings.map((check) => check.label).join(', ')}`
      : 'Bereit: Key und Stimmen-ID funktionieren';

  return { ok: problems.length === 0, at, voiceId, modelId, apiBase, checks, summary };
}

/**
 * Synthetisiert einen Satz über die ElevenLabs-API. Rückgabe ist MP3, das der
 * Renderer mit decodeAudioData direkt abspielen kann.
 */
async function synthesize(text, { timeoutMs = 20000 } = {}) {
  const { key, voiceId, modelId, apiBase } = settings();
  if (!key) return { ok: false, error: 'ELEVENLABS_API_KEY fehlt' };

  const input = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 1200);
  if (!input) return { ok: false, error: 'leerer Text' };

  try {
    const response = await fetch(
      `${apiBase}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': key,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text: input,
          model_id: modelId,
          voice_settings: { stability: 0.45, similarity_boost: 0.8 },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      },
    );

    if (!response.ok) {
      let data = null;
      try {
        data = await response.json();
      } catch {
        /* Antwort war kein JSON */
      }
      // Status und Klartext zusammen, damit 401/404/402 unterscheidbar bleiben.
      return { ok: false, error: `ElevenLabs: ${describeResponse(response.status, data)}` };
    }

    const audio = Buffer.from(await response.arrayBuffer());
    if (audio.length < 500) return { ok: false, error: 'ElevenLabs: leere Antwort' };
    return { ok: true, audio, mime: 'audio/mpeg', characters: input.length };
  } catch (error) {
    const timeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    return {
      ok: false,
      error: timeout ? 'ElevenLabs: Zeitüberschreitung' : `ElevenLabs: ${error?.message ?? 'Fehler'}`,
    };
  }
}

module.exports = {
  DEFAULT_VOICE_ID,
  configure,
  available,
  info,
  test,
  synthesize,
};
