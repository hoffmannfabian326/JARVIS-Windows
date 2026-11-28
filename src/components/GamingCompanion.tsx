import { useEffect, useMemo, useState } from 'react';
import { askBrain } from '../lib/brain';
import { formatMetric, formatNetwork, formatSessionDuration, launcherLabel } from '../lib/gaming';
import { useGaming } from '../hooks/useGaming';
import { GameArt, Sparkline } from './gaming/GamingUi';

export default function GamingCompanion() {
  const gaming = useGaming();
  const snapshot = gaming.snapshot;
  const active = snapshot.activeSession;
  const [now, setNow] = useState(Date.now());
  const [prompt, setPrompt] = useState('');
  const [answer, setAnswer] = useState('');
  const [asking, setAsking] = useState(false);
  const [aiError, setAiError] = useState('');

  useEffect(() => {
    if (!active) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active?.id]);

  const elapsed = active ? Math.max(active.elapsedSeconds, Math.round((now - active.startedAt) / 1000)) : 0;
  const game = snapshot.games.find((entry) => entry.id === (active?.gameId || snapshot.settings.selectedGameId));
  const timeline = active?.timeline ?? [];
  const guides = snapshot.guides.slice(0, 3);
  const lastSession = snapshot.sessions[0];

  const context = useMemo(
    () =>
      [
        'Du bist der kompakte Gaming-Companion von J.A.R.V.I.S. Antworte auf Deutsch, in maximal drei kurzen Sätzen.',
        active
          ? `Aktive Sitzung ${active.gameName}, seit ${formatSessionDuration(elapsed)}, CPU ${formatMetric(active.live.cpu)}, GPU ${formatMetric(active.live.gpu)}, RAM ${formatMetric(active.live.ram)}, CPU-Temperatur ${formatMetric(active.live.cpuTemp, ' °C')}, GPU-Temperatur ${formatMetric(active.live.gpuTemp, ' °C')}.`
          : 'Es läuft keine Spielsitzung.',
        lastSession
          ? `Letzte Sitzung: ${lastSession.gameName}, ${Math.round(lastSession.durationSeconds / 60)} Minuten, Auffälligkeiten: ${lastSession.anomalies.join(' ') || 'keine'}.`
          : 'Kein Sitzungsbericht vorhanden.',
        guides.length ? `Hinterlegte Guides: ${guides.map((guide) => guide.title).join('; ')}.` : 'Keine Guides hinterlegt.',
        'Erfinde keine Werte. Wenn eine Information fehlt, sage es.',
      ].join('\n'),
    [active, elapsed, guides, lastSession],
  );

  const ask = async () => {
    if (!prompt.trim() || asking) return;
    setAsking(true);
    setAiError('');
    setAnswer('');
    try {
      const result = await askBrain(`${context}\n\nFrage: ${prompt.trim()}`, [], [], {});
      setAnswer(result.answer.trim() || 'Keine Antwort erhalten.');
    } catch {
      setAiError('KI nicht erreichbar. Prüfe den Anbieter in J.A.R.V.I.S.');
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="gaming-companion">
      <header className="companion-head">
        <div className="companion-brand">
          <span aria-hidden="true">J</span>
          <div>
            <strong>J.A.R.V.I.S.</strong>
            <small>GAMING COMPANION</small>
          </div>
        </div>
        <div className="companion-window-actions">
          <button type="button" onClick={() => void gaming.openCompanion()} title="In den Vordergrund" aria-label="Vordergrund">
            ◻
          </button>
          <button type="button" onClick={() => window.close()} aria-label="Companion ausblenden">
            ×
          </button>
        </div>
      </header>

      <div className="companion-drag" aria-hidden="true">
        <span />
      </div>

      <main className="companion-body">
        {gaming.notice ? (
          <div className="companion-notice">
            <span>{gaming.notice}</span>
            <button type="button" onClick={gaming.dismissNotice} aria-label="Hinweis schließen">
              ×
            </button>
          </div>
        ) : null}

        <section className={`companion-session ${active ? 'is-live' : ''}`}>
          <div className="companion-session-copy">
            <small>{active ? 'SITZUNG LÄUFT' : 'BEREIT'}</small>
            <strong>{active?.gameName || game?.name || 'Kein Spiel aktiv'}</strong>
            <span>
              {active
                ? `${formatSessionDuration(elapsed)} · ${active.modeActive ? 'Gaming Mode' : 'ohne Modus'} · ${active.sampleCount} Messpunkte`
                : game
                  ? `${launcherLabel(game.launcher)} · zuletzt ${new Date(game.lastPlayedAt || Date.now()).toLocaleDateString('de-DE')}`
                  : 'Starte ein Spiel über den Gaming Hub.'}
            </span>
          </div>
          {game ? <GameArt game={game} artwork={gaming.artwork} requestArtwork={gaming.requestArtwork} /> : null}
        </section>

        <section className="companion-metrics">
          <div>
            <small>CPU</small>
            <strong>{formatMetric(active?.live.cpu ?? null)}</strong>
          </div>
          <div>
            <small>GPU</small>
            <strong>{formatMetric(active?.live.gpu ?? null)}</strong>
          </div>
          <div>
            <small>RAM</small>
            <strong>{formatMetric(active?.live.ram ?? null)}</strong>
          </div>
          <div>
            <small>TEMP</small>
            <strong>{formatMetric(Math.max(active?.live.cpuTemp ?? 0, active?.live.gpuTemp ?? 0) || null, ' °C')}</strong>
          </div>
          <div>
            <small>NETZ</small>
            <strong>{active?.live.down == null ? '—' : formatNetwork(active.live.down)}</strong>
          </div>
          <div>
            <small>FPS</small>
            <strong className="is-muted">n. v.</strong>
          </div>
        </section>

        <div className="companion-spark">
          <Sparkline values={timeline.map((sample) => sample.cpu)} color="#f28c28" height={40} />
        </div>

        <div className="companion-actions">
          <button type="button" onClick={() => void gaming.companionAction('chat')}>
            KI-Chat
          </button>
          <button type="button" onClick={() => void gaming.companionAction('voice')}>
            Sprache
          </button>
          <button type="button" onClick={() => void gaming.companionAction('hub')}>
            Gaming Hub
          </button>
          {active ? (
            <button type="button" className="is-danger" onClick={() => void gaming.stop()}>
              Beenden
            </button>
          ) : null}
        </div>

        <section className="companion-ai">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void ask();
            }}
          >
            <input value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Kurze Frage an J.A.R.V.I.S." />
            <button type="submit" disabled={asking || !prompt.trim()}>
              {asking ? '…' : '→'}
            </button>
          </form>
          {aiError ? <p className="is-warn">{aiError}</p> : null}
          {answer ? <p className="companion-answer">{answer}</p> : null}
        </section>

        <section className="companion-guides">
          <header>
            <small>GUIDES</small>
            <button type="button" onClick={() => void gaming.companionAction('hub')}>
              alle
            </button>
          </header>
          {guides.length ? (
            guides.map((guide) => (
              <button key={guide.id} type="button" onClick={() => void gaming.openGuide(guide.url)}>
                <span>{guide.title}</span>
                <small>↗</small>
              </button>
            ))
          ) : (
            <p>Noch keine Guides hinterlegt.</p>
          )}
        </section>
      </main>

      <footer className="companion-foot">
        <button type="button" className="is-quiet" onClick={() => void gaming.disableCompanion()}>
          Companion deaktivieren
        </button>
        <span>{gaming.supported ? 'LOKAL VERBUNDEN' : 'DESKTOP ERFORDERLICH'}</span>
      </footer>
    </div>
  );
}
