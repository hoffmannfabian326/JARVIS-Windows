import { useEffect, useState } from 'react';
import { getDesktop, type UpdateState } from '../lib/desktop';

const STATUS_TITLE: Record<UpdateState['status'], string> = {
  idle: 'Bereit für eine Prüfung',
  disabled: 'Nur in der installierten App',
  checking: 'Suche nach Updates …',
  available: 'Update gefunden — Download startet',
  downloading: 'Update wird geladen',
  ready: 'Update bereit zur Installation',
  none: 'Jarvis ist aktuell',
  error: 'Prüfung fehlgeschlagen',
};

const STATUS_HINT: Record<UpdateState['status'], string> = {
  idle: 'Beim Start und danach alle sechs Stunden prüft Jarvis von selbst.',
  disabled: 'Im Entwicklungsmodus gibt es keine Updates. Die installierte App prüft automatisch.',
  checking: 'Verbindung zum Release-Kanal wird geprüft.',
  available: 'Der Download läuft im Hintergrund; Jarvis bleibt bedienbar.',
  downloading: 'Die neue Fassung wird geladen. Du kannst weiterarbeiten.',
  ready: 'Ein Neustart genügt. Beim normalen Beenden installiert Jarvis das Update ebenfalls.',
  none: 'Die installierte Version ist die neueste im Kanal.',
  error: 'Jarvis läuft unverändert weiter. Prüfe Verbindung und Release-Seite.',
};

const REFRESH_HINT =
  'Lädt von GitHub und prüft vor der Installation die SHA-512-Prüfsumme aus latest.yml. Kein Token in der App, keine Kontodaten.';

const numberFormat = new Intl.NumberFormat('de-DE');

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—';
  const mb = value / 1024 / 1024;
  return `${mb.toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`;
}

function formatChecked(at: number): string {
  if (!at) return '—';
  return new Date(at).toLocaleString('de-DE', { hour12: false });
}

function errorHint(message: string): string {
  if (/404|not found|latest\.yml/i.test(message)) {
    return 'Das Release ist nicht öffentlich erreichbar. latest.yml und Setup müssen im neuesten Release eines öffentlichen Repos liegen.';
  }
  if (/sha512|checksum|integrity/i.test(message)) {
    return 'Die Prüfsumme passt nicht. Download wurde verworfen — bitte erneut prüfen.';
  }
  if (/ENOTFOUND|ECONN|ETIMEDOUT|timeout|network/i.test(message)) {
    return 'Keine Verbindung zum Release-Kanal. Offline bleibt Jarvis voll nutzbar.';
  }
  return 'Details stehen im Fehlerprogramm.';
}

export default function UpdateView() {
  const desktop = getDesktop();
  const [state, setState] = useState<UpdateState | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!desktop?.updateState) return undefined;
    void desktop.updateState().then(setState).catch(() => undefined);
    return desktop.onUpdateState?.(setState);
  }, [desktop]);

  const check = async () => {
    setBusy(true);
    setNote('');
    try {
      const next = await desktop?.checkForUpdates?.();
      if (next) setState(next);
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'Prüfung fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  const install = async () => {
    setNote('');
    try {
      const result = await desktop?.installUpdate?.();
      if (result && !result.ok) setNote(result.error || 'Installation nicht möglich.');
    } catch {
      setNote('Installation konnte nicht gestartet werden.');
    }
  };

  const status = state?.status ?? (desktop?.updateState ? 'idle' : 'disabled');
  const percent = Math.max(0, Math.min(100, state?.percent ?? 0));
  const tone = status === 'error' ? 'warn' : status === 'ready' || status === 'none' ? 'ok' : 'off';
  const downloading = status === 'downloading';
  const ready = status === 'ready';
  const canCheck = Boolean(desktop?.checkForUpdates) && !busy && !downloading && !ready;

  return (
    <section className="update-view" aria-label="Update">
      <header className="update-head">
        <p className="kicker">Systemwartung</p>
        <h2>Update-Kanal</h2>
        <p>
          Jarvis aktualisiert sich aus einem Release-Kanal. Einmal installiert, genügt ein Neustart — kein
          Installer, keine Teilstücke, kein manuelles Herunterladen.
        </p>
      </header>

      <div className={`update-status-card tone-${tone}`}>
        <div className="update-status-row">
          <span className="update-dot" aria-hidden="true" />
          <strong>{STATUS_TITLE[status]}</strong>
          {state?.newVersion ? <span className="update-target">→ {state.newVersion}</span> : null}
        </div>
        <p>{STATUS_HINT[status]}</p>
      </div>

      {downloading || ready ? (
        <div className={`update-bar ${ready ? 'is-done' : ''}`} aria-hidden="true">
          <span style={{ width: `${ready ? 100 : percent}%` }} />
        </div>
      ) : null}

      {state?.error && status === 'error' ? (
        <div className="update-error">
          <p>{state.error}</p>
          <p className="field-hint">{errorHint(state.error)}</p>
        </div>
      ) : null}

      <div className="update-actions">
        <button type="button" className="ghost-button" onClick={() => void check()} disabled={!canCheck}>
          {busy || status === 'checking' ? 'Prüfe …' : 'Nach Updates suchen'}
        </button>
        {ready ? (
          <button type="button" className="gate-allow" onClick={() => void install()}>
            Neu starten und installieren
          </button>
        ) : null}
      </div>

      {note ? <p className="crash-note">{note}</p> : null}

      <div className="update-meta">
        <div>
          <span>Installiert</span>
          <strong>v{state?.current || '—'}</strong>
        </div>
        <div>
          <span>Kanal</span>
          <strong>GitHub · stabil</strong>
        </div>
        <div>
          <span>Letzte Prüfung</span>
          <strong>{formatChecked(state?.checkedAt ?? 0)}</strong>
        </div>
        <div>
          <span>Übertragen</span>
          <strong>
            {downloading || ready
              ? `${formatBytes(state?.transferred ?? 0)} / ${formatBytes(state?.total ?? 0)}`
              : '—'}
          </strong>
        </div>
        <div>
          <span>Installation</span>
          <strong>beim Neustart oder Beenden</strong>
        </div>
        <div>
          <span>Prüfung</span>
          <strong>SHA-512 aus latest.yml</strong>
        </div>
      </div>

      <p className="update-note">
        {REFRESH_HINT} Die Alpha-Builds sind unsigniert; Windows zeigt beim allerersten Installer eventuell einen
        SmartScreen-Hinweis. Updates selbst laufen still.
        {state && state.total > 0 ? ` Aktueller Download: ${numberFormat.format(state.total)} Bytes.` : ''}
      </p>
    </section>
  );
}
