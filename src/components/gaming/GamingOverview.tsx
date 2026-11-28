import { useMemo, useState } from 'react';
import { askBrain } from '../../lib/brain';
import {
  formatMetric,
  formatPlayedAt,
  formatPlaytime,
  formatSessionDuration,
  latestSessionFor,
  launcherLabel,
  type GamingGame,
} from '../../lib/gaming';
import type { GamingState } from '../../hooks/useGaming';
import { GameArt, GamingEmpty } from './GamingUi';

export default function GamingOverview({
  gaming,
  onNavigate,
  onInspect,
  onAdd,
}: {
  gaming: GamingState;
  onNavigate: (target: 'library' | 'guides' | 'news' | 'profiles' | 'performance' | 'wow') => void;
  onInspect: (game: GamingGame) => void;
  onAdd: () => void;
}) {
  const snapshot = gaming.snapshot;
  const active = snapshot.activeSession;
  const selected =
    snapshot.games.find((game) => game.id === active?.gameId) ||
    snapshot.games.find((game) => game.id === snapshot.settings.selectedGameId) ||
    snapshot.games.find((game) => game.id === snapshot.sessions[0]?.gameId) ||
    snapshot.games[0];
  const lastSession = selected ? latestSessionFor(snapshot.sessions, selected.id) : undefined;
  const recent = snapshot.games.filter((game) => game.lastPlayedAt > 0).sort((a, b) => b.lastPlayedAt - a.lastPlayedAt).slice(0, 4);
  const favorites = snapshot.games.filter((game) => game.favorite).slice(0, 5);
  const news = snapshot.articles.slice(0, 4);
  const guides = snapshot.guides.slice(0, 4);
  const [prompt, setPrompt] = useState('');
  const [answer, setAnswer] = useState('');
  const [asking, setAsking] = useState(false);
  const [aiError, setAiError] = useState('');

  const context = useMemo(() => {
    const lines = [
      'Du bist der Gaming-Intelligenz-Kern von J.A.R.V.I.S. Antworte auf Deutsch, präzise und ohne erfundene Fakten.',
      selected
        ? `Ausgewähltes Spiel: ${selected.name}, Launcher ${launcherLabel(selected.launcher)}, Genre ${selected.genre || 'unbekannt'}, Spielzeit ${formatPlaytime(selected.playtimeSeconds)}. Beschreibung: ${selected.description || 'keine'}.`
        : 'Es ist noch kein Spiel ausgewählt.',
      active
        ? `Aktive Sitzung: ${active.gameName}, seit ${formatSessionDuration(active.elapsedSeconds)}, CPU ${formatMetric(active.live.cpu)}, GPU ${formatMetric(active.live.gpu)}, RAM ${formatMetric(active.live.ram)}.`
        : 'Aktuell läuft keine Spielsitzung.',
      lastSession
        ? `Letzte Sitzung: ${lastSession.gameName}, ${Math.round(lastSession.durationSeconds / 60)} Minuten, CPU Ø ${formatMetric(lastSession.avgCpu)}, GPU Ø ${formatMetric(lastSession.avgGpu)}, max. Temperatur ${Math.max(lastSession.maxCpuTemp ?? 0, lastSession.maxGpuTemp ?? 0) || 'unbekannt'} Grad. Auffälligkeiten: ${lastSession.anomalies.join(' ') || 'keine'}.`
        : 'Kein Sitzungsbericht vorhanden.',
      snapshot.wow.events.length
        ? `WoW-Termine: ${snapshot.wow.events.slice(0, 5).map((event) => `${event.title} am ${new Date(event.at).toLocaleString('de-DE')}`).join('; ')}.`
        : 'Keine WoW-Termine hinterlegt.',
      news.length ? `Aktuelle Meldungen: ${news.map((article) => article.title).join('; ')}.` : 'Keine News geladen.',
      guides.length ? `Verfügbare Guides: ${guides.map((guide) => guide.title).join('; ')}.` : 'Keine Guides hinterlegt.',
      'Wenn eine Information oben fehlt, sage das offen. Verweise bei Guides auf die hinterlegten Links, statt Inhalte zu erfinden.',
    ];
    return lines.join('\n');
  }, [selected, active, lastSession, snapshot.wow.events, news, guides]);

  const ask = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || asking) return;
    setAsking(true);
    setAiError('');
    setAnswer('');
    try {
      const result = await askBrain(`${context}\n\nFrage des Nutzers: ${trimmed}`, [], [], {});
      setAnswer(result.answer.trim() || 'Das Sprachmodell hat keine Antwort geliefert.');
    } catch {
      setAiError('Die Gaming-Intelligenz ist gerade nicht erreichbar. Prüfe den KI-Anbieter in den Einstellungen.');
    } finally {
      setAsking(false);
    }
  };

  if (!snapshot.games.length) {
    return (
      <section className="gaming-view">
        <div className="gaming-overview-empty">
          <span className="gaming-eyebrow">GAMING HUB · BEREIT</span>
          <h1>Deine Gaming-Kommandozentrale</h1>
          <p>
            Der Hub verbindet Bibliothek, Spielstarts, Live-Hardware, News, Guides und Automationen. Starte einen Launcher-Scan
            oder hinterlege dein erstes Spiel mit einer lokalen Startdatei.
          </p>
          <div className="gaming-row-actions">
            <button type="button" className="gaming-button is-primary" onClick={onAdd} disabled={!gaming.supported}>
              Spiel hinzufügen
            </button>
            <button type="button" className="gaming-button is-ghost" onClick={() => void gaming.detect()} disabled={!gaming.supported || gaming.busy === 'detect'}>
              Launcher scannen
            </button>
          </div>
          <p className="gaming-muted">
            {snapshot.detection.message}
            {snapshot.detection.launchers.length
              ? ` · ${snapshot.detection.launchers.filter((entry) => entry.detected).length} Launcher erkannt`
              : ''}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="gaming-view is-overview">
      {selected ? (
        <div className="gaming-hero">
          <GameArt game={selected} kind="hero" artwork={gaming.artwork} requestArtwork={gaming.requestArtwork} className="gaming-hero-art" />
          <div className="gaming-hero-shade" />
          <div className="gaming-hero-content">
            <div className="gaming-hero-copy">
              <div className="gaming-hero-tags">
                <span>{launcherLabel(selected.launcher)}</span>
                {selected.genre ? <span>{selected.genre}</span> : null}
                {active?.gameId === selected.id ? <span className="is-live">SITZUNG LÄUFT</span> : null}
              </div>
              <h1>{selected.name}</h1>
              <p>{selected.description || 'Für dieses Spiel ist noch keine Beschreibung hinterlegt. Ergänze sie im Spielprofil.'}</p>
              <div className="gaming-hero-stats">
                <span>
                  <small>SPIELZEIT</small>
                  <strong>{formatPlaytime(selected.playtimeSeconds)}</strong>
                </span>
                <span>
                  <small>LETZTE SITZUNG</small>
                  <strong>{formatPlayedAt(selected.lastPlayedAt)}</strong>
                </span>
                <span>
                  <small>STATUS</small>
                  <strong className={active?.gameId === selected.id ? 'is-live' : ''}>
                    {active?.gameId === selected.id ? 'Im Spiel' : 'Bereit'}
                  </strong>
                </span>
              </div>
              <div className="gaming-hero-actions">
                {active?.gameId === selected.id ? (
                  <button type="button" className="gaming-button is-danger" onClick={() => void gaming.stop()} disabled={gaming.busy === 'stop'}>
                    Sitzung beenden
                  </button>
                ) : (
                  <button
                    type="button"
                    className="gaming-button is-primary"
                    onClick={() => void gaming.launch(selected.id)}
                    disabled={Boolean(active) || gaming.busy === 'launch'}
                  >
                    {gaming.busy === 'launch' ? 'Startet …' : 'Spielen'}
                  </button>
                )}
                <button
                  type="button"
                  className={`gaming-button ${selected.favorite ? 'is-warm' : 'is-ghost'}`}
                  onClick={() => void gaming.updateGame(selected.id, { favorite: !selected.favorite })}
                >
                  {selected.favorite ? '★ Favorit' : '☆ Favorit'}
                </button>
                <button type="button" className="gaming-button is-ghost" onClick={() => onNavigate('guides')}>
                  Guides
                </button>
                <button type="button" className="gaming-button is-ghost" onClick={() => onNavigate('profiles')}>
                  Profil
                </button>
              </div>
            </div>
            <aside className="gaming-hero-aside">
              <div className="gaming-state-card">
                <span className="gaming-eyebrow">SYSTEMSTATUS</span>
                <div>
                  <small>GAMING MODE</small>
                  <strong>{active?.modeActive ? 'AKTIV' : snapshot.automationEnabled ? 'BEREIT' : 'AUS'}</strong>
                </div>
                <div>
                  <small>MONITORING</small>
                  <strong>{active ? `${active.sampleCount} Messpunkte` : 'STANDBY'}</strong>
                </div>
                <div>
                  <small>PROFIL</small>
                  <strong>{active?.profileId ? 'GELADEN' : 'AUTO'}</strong>
                </div>
                <button type="button" className="gaming-button is-ghost is-small" onClick={() => onNavigate('performance')}>
                  Performance öffnen
                </button>
              </div>
            </aside>
          </div>
        </div>
      ) : null}

      <div className="gaming-overview-grid">
        <section className="gaming-panel gaming-continue">
          <header>
            <div>
              <span className="gaming-eyebrow">ZULETZT</span>
              <h3>Weiterspielen</h3>
            </div>
            <button type="button" className="gaming-button is-ghost is-small" onClick={() => onNavigate('library')}>
              Bibliothek
            </button>
          </header>
          {recent.length ? (
            <div className="gaming-rail">
              {recent.map((game) => (
                <button
                  key={game.id}
                  type="button"
                  className="gaming-rail-card"
                  onClick={() => {
                    void gaming.select(game.id);
                    onInspect(game);
                  }}
                >
                  <GameArt game={game} artwork={gaming.artwork} requestArtwork={gaming.requestArtwork} />
                  <span>{game.name}</span>
                  <small>{formatPlaytime(game.playtimeSeconds)}</small>
                </button>
              ))}
            </div>
          ) : (
            <p className="gaming-muted">Noch keine Spielsitzung. Starte ein Spiel, um hier fortzufahren.</p>
          )}
        </section>

        <section className="gaming-panel gaming-intel">
          <header>
            <div>
              <span className="gaming-eyebrow">J.A.R.V.I.S. · GAMING INTELLIGENCE</span>
              <h3>Frag den Gaming-Kern</h3>
            </div>
            <span className={`gaming-ai-dot ${asking ? 'is-busy' : ''}`} />
          </header>
          <div className="gaming-ai-quick">
            <button type="button" onClick={() => void ask(`Erkläre mir die wichtigsten Spielmechaniken von ${selected?.name || 'meinem ausgewählten Spiel'}.`)}>
              Spielmechaniken erklären
            </button>
            <button type="button" onClick={() => void ask('Fasse meine letzte Spielsitzung und die Systemwerte zusammen.')}>
              Letzte Sitzung deuten
            </button>
            <button type="button" onClick={() => void ask('Was gibt es Neues in meinen Gaming-News? Fasse die wichtigsten Punkte zusammen.')}>
              News zusammenfassen
            </button>
            <button type="button" onClick={() => void ask('Was steht als Nächstes in World of Warcraft an? Nutze nur meine hinterlegten Termine und Quellen.')}>
              WoW-Briefing
            </button>
          </div>
          <form
            className="gaming-ai-form"
            onSubmit={(event) => {
              event.preventDefault();
              void ask(prompt);
            }}
          >
            <input
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="z. B. Erkläre mir den nächsten Raid oder interpretiere meine Temperaturen."
              disabled={asking}
            />
            <button type="submit" className="gaming-button is-primary is-small" disabled={asking || !prompt.trim()}>
              {asking ? 'Denkt …' : 'Fragen'}
            </button>
          </form>
          {aiError ? <p className="gaming-form-message">{aiError}</p> : null}
          {answer ? <div className="gaming-ai-answer">{answer}</div> : null}
          <p className="gaming-muted">
            Der Gaming-Kern nutzt deinen eingerichteten KI-Anbieter. Quellen und Werte werden nur aus dem lokalen Hub übergeben.
          </p>
        </section>

        <section className="gaming-panel">
          <header>
            <div>
              <span className="gaming-eyebrow">FAVORITEN</span>
              <h3>Deine Auswahl</h3>
            </div>
          </header>
          {favorites.length ? (
            <div className="gaming-favorite-list">
              {favorites.map((game) => (
                <button key={game.id} type="button" onClick={() => onInspect(game)}>
                  <GameArt game={game} artwork={gaming.artwork} requestArtwork={gaming.requestArtwork} />
                  <span>
                    <strong>{game.name}</strong>
                    <small>{launcherLabel(game.launcher)}</small>
                  </span>
                  <span>★</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="gaming-muted">Markiere Spiele mit dem Stern, um sie hier zu sammeln.</p>
          )}
        </section>

        <section className="gaming-panel">
          <header>
            <div>
              <span className="gaming-eyebrow">NEWS &amp; GUIDES</span>
              <h3>Aus deinen Quellen</h3>
            </div>
            <button type="button" className="gaming-button is-ghost is-small" onClick={() => onNavigate('news')}>
              Alle News
            </button>
          </header>
          {news.length ? (
            <ul className="gaming-headline-list">
              {news.map((article) => (
                <li key={article.id}>
                  <button type="button" onClick={() => void gaming.openGuide(article.url)}>
                    {article.title}
                  </button>
                  <small>{article.sourceName}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="gaming-muted">Noch keine Meldungen. Konfiguriere Quellen im News-Bereich.</p>
          )}
          {guides.length ? (
            <div className="gaming-quick-guides">
              {guides.slice(0, 2).map((guide) => (
                <button key={guide.id} type="button" onClick={() => void gaming.openGuide(guide.url)}>
                  {guide.title}
                </button>
              ))}
            </div>
          ) : null}
        </section>
      </div>

      {!snapshot.sources.length ? (
        <GamingEmpty
          title="Gaming Intelligence erweitern"
          text="Hinterlege RSS-Quellen und Guides, damit News, Patchnotes und KI-Briefings auf echten Inhalten basieren."
          action={
            <button type="button" className="gaming-button is-primary" onClick={() => onNavigate('news')}>
              Quellen einrichten
            </button>
          }
        />
      ) : null}
    </section>
  );
}
