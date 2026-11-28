import { useMemo, useState } from 'react';
import {
  GAMING_LAUNCHERS,
  formatPlayedAt,
  formatPlaytime,
  latestSessionFor,
  launcherLabel,
  type GamingGame,
} from '../../lib/gaming';
import type { GamingState } from '../../hooks/useGaming';
import { GameArt, GamingEmpty, GamingModal } from './GamingUi';

type Preset = 'all' | 'recent' | 'favorites';

const PRESET_TITLE: Record<Preset, string> = {
  all: 'Spielebibliothek',
  recent: 'Zuletzt gespielt',
  favorites: 'Favoriten',
};

const PRESET_HINT: Record<Preset, string> = {
  all: 'Alle lokal erkannten und manuell hinterlegten Titel.',
  recent: 'Deine letzten Sitzungen, nach Aktivität sortiert.',
  favorites: 'Schnellzugriff auf die Titel, die du markiert hast.',
};

export function GamingLibrary({
  gaming,
  preset,
  onInspect,
  onAdd,
  onEdit,
}: {
  gaming: GamingState;
  preset: Preset;
  onInspect: (game: GamingGame) => void;
  onAdd: () => void;
  onEdit: (game: GamingGame) => void;
}) {
  const snapshot = gaming.snapshot;
  const [search, setSearch] = useState('');
  const [launcher, setLauncher] = useState('all');
  const [genre, setGenre] = useState('all');
  const [sort, setSort] = useState<'recent' | 'playtime' | 'name'>('recent');
  const [view, setView] = useState<'grid' | 'list'>('grid');

  const genres = useMemo(
    () => Array.from(new Set(snapshot.games.map((game) => game.genre).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'de')),
    [snapshot.games],
  );

  const games = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return snapshot.games
      .filter((game) => (preset === 'favorites' ? game.favorite : true))
      .filter((game) => (preset === 'recent' ? game.lastPlayedAt > 0 : true))
      .filter((game) => (launcher === 'all' ? true : game.launcher === launcher))
      .filter((game) => (genre === 'all' ? true : game.genre === genre))
      .filter((game) => (!needle ? true : `${game.name} ${game.genre} ${game.description}`.toLowerCase().includes(needle)))
      .sort((a, b) => {
        if (sort === 'name') return a.name.localeCompare(b.name, 'de');
        if (sort === 'playtime') return b.playtimeSeconds - a.playtimeSeconds;
        return b.lastPlayedAt - a.lastPlayedAt || a.name.localeCompare(b.name, 'de');
      });
  }, [snapshot.games, preset, launcher, genre, search, sort]);

  const activeId = snapshot.activeSession?.gameId || '';

  return (
    <section className="gaming-view">
      <header className="gaming-view-head">
        <div>
          <span className="gaming-eyebrow">BIBLIOTHEK · {snapshot.games.length} TITEL</span>
          <h2>{PRESET_TITLE[preset]}</h2>
          <p>{PRESET_HINT[preset]}</p>
        </div>
        <div className="gaming-head-actions">
          <button type="button" className="gaming-button is-ghost" onClick={() => void gaming.detect()} disabled={!gaming.supported || gaming.busy === 'detect'}>
            {gaming.busy === 'detect' ? 'Erkenne …' : 'Launcher scannen'}
          </button>
          <button type="button" className="gaming-button is-primary" onClick={onAdd} disabled={!gaming.supported}>
            + Spiel hinzufügen
          </button>
        </div>
      </header>

      <div className="gaming-toolbar">
        <label className="gaming-search">
          <span aria-hidden="true">⌕</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Spiele durchsuchen" aria-label="Spiele durchsuchen" />
        </label>
        <select value={launcher} onChange={(event) => setLauncher(event.target.value)} aria-label="Launcher filtern">
          <option value="all">Alle Launcher</option>
          {GAMING_LAUNCHERS.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
        <select value={genre} onChange={(event) => setGenre(event.target.value)} aria-label="Genre filtern">
          <option value="all">Alle Genres</option>
          {genres.map((entry) => (
            <option key={entry} value={entry}>
              {entry}
            </option>
          ))}
        </select>
        <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} aria-label="Sortierung">
          <option value="recent">Zuletzt gespielt</option>
          <option value="playtime">Spielzeit</option>
          <option value="name">Name</option>
        </select>
        <div className="gaming-view-switch" role="group" aria-label="Ansicht">
          <button type="button" className={view === 'grid' ? 'is-active' : ''} onClick={() => setView('grid')} aria-label="Rasteransicht">
            ▦
          </button>
          <button type="button" className={view === 'list' ? 'is-active' : ''} onClick={() => setView('list')} aria-label="Listenansicht">
            ☰
          </button>
        </div>
      </div>

      {snapshot.detection.errors.length ? (
        <div className="gaming-inline-warning">
          <strong>Erkennung meldet Hinweise</strong>
          <span>{snapshot.detection.errors.slice(0, 3).join(' · ')}</span>
        </div>
      ) : null}

      {!games.length ? (
        <GamingEmpty
          title={snapshot.games.length ? 'Keine Treffer' : 'Noch keine Spiele'}
          text={
            snapshot.games.length
              ? 'Passe Suche oder Filter an.'
              : gaming.supported
                ? 'Starte einen Launcher-Scan oder hinterlege ein Spiel mit lokaler Startdatei.'
                : 'Die automatische Erkennung ist nur in der Desktop-App verfügbar.'
          }
          action={
            gaming.supported && !snapshot.games.length ? (
              <button type="button" className="gaming-button is-primary" onClick={onAdd}>
                Erstes Spiel hinzufügen
              </button>
            ) : undefined
          }
        />
      ) : view === 'grid' ? (
        <div className="gaming-grid">
          {games.map((game) => {
            const sessions = snapshot.sessions.filter((session) => session.gameId === game.id);
            const playing = game.id === activeId;
            return (
              <article key={game.id} className={`gaming-card ${playing ? 'is-playing' : ''}`} onClick={() => onInspect(game)}>
                <div className="gaming-card-art">
                  <GameArt game={game} artwork={gaming.artwork} requestArtwork={gaming.requestArtwork} kind="cover" />
                  <div className="gaming-card-shade" />
                  <button
                    type="button"
                    className={`gaming-star ${game.favorite ? 'is-on' : ''}`}
                    aria-label={game.favorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
                    onClick={(event) => {
                      event.stopPropagation();
                      void gaming.updateGame(game.id, { favorite: !game.favorite });
                    }}
                  >
                    ★
                  </button>
                  {playing ? <span className="gaming-live-badge">LÄUFT</span> : null}
                  {game.available === false ? <span className="gaming-offline-badge">PFAD FEHLT</span> : null}
                  <div className="gaming-card-play">
                    <button
                      type="button"
                      className="gaming-button is-primary is-small"
                      onClick={(event) => {
                        event.stopPropagation();
                        void gaming.launch(game.id);
                      }}
                      disabled={Boolean(snapshot.activeSession)}
                    >
                      Spielen
                    </button>
                    <button
                      type="button"
                      className="gaming-button is-ghost is-small"
                      onClick={(event) => {
                        event.stopPropagation();
                        onEdit(game);
                      }}
                    >
                      Bearbeiten
                    </button>
                  </div>
                </div>
                <div className="gaming-card-body">
                  <div className="gaming-card-title">
                    <h3>{game.name}</h3>
                    <span>{launcherLabel(game.launcher)}</span>
                  </div>
                  <p>{game.genre || 'Ohne Genre'}</p>
                  <div className="gaming-card-meta">
                    <span>{formatPlaytime(game.playtimeSeconds)}</span>
                    <span>{sessions.length} Sitzungen</span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="gaming-list">
          <div className="gaming-list-head">
            <span>Spiel</span>
            <span>Launcher</span>
            <span>Spielzeit</span>
            <span>Zuletzt</span>
            <span />
          </div>
          {games.map((game) => (
            <div key={game.id} className={`gaming-list-row ${game.id === activeId ? 'is-playing' : ''}`} onClick={() => onInspect(game)}>
              <div className="gaming-list-title">
                <GameArt game={game} artwork={gaming.artwork} requestArtwork={gaming.requestArtwork} />
                <div>
                  <strong>{game.name}</strong>
                  <small>{game.genre || 'Ohne Genre'}</small>
                </div>
              </div>
              <span>{launcherLabel(game.launcher)}</span>
              <span>{formatPlaytime(game.playtimeSeconds)}</span>
              <span>{formatPlayedAt(game.lastPlayedAt)}</span>
              <div className="gaming-list-actions">
                <button
                  type="button"
                  className={`gaming-icon-button ${game.favorite ? 'is-warm' : ''}`}
                  aria-label="Favorit"
                  onClick={(event) => {
                    event.stopPropagation();
                    void gaming.updateGame(game.id, { favorite: !game.favorite });
                  }}
                >
                  ★
                </button>
                <button
                  type="button"
                  className="gaming-button is-ghost is-small"
                  onClick={(event) => {
                    event.stopPropagation();
                    void gaming.launch(game.id);
                  }}
                  disabled={Boolean(snapshot.activeSession)}
                >
                  Start
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function GamingGameDetail({
  gaming,
  game,
  onClose,
  onEdit,
  onOpenGuides,
  onOpenProfile,
}: {
  gaming: GamingState;
  game: GamingGame;
  onClose: () => void;
  onEdit: (game: GamingGame) => void;
  onOpenGuides: () => void;
  onOpenProfile: (game: GamingGame) => void;
}) {
  const snapshot = gaming.snapshot;
  const profile = snapshot.profiles.find((entry) => entry.gameId === game.id);
  const lastSession = latestSessionFor(snapshot.sessions, game.id);
  const active = snapshot.activeSession?.gameId === game.id;
  const guides = snapshot.guides.filter(
    (guide) =>
      guide.game === game.id ||
      guide.game.toLowerCase().includes(game.name.toLowerCase()) ||
      game.name.toLowerCase().includes(guide.game.toLowerCase()),
  );

  return (
    <GamingModal
      title={game.name}
      hint={`${launcherLabel(game.launcher)} · ${game.genre || 'Ohne Genre'} · ${game.source === 'detected' ? 'automatisch erkannt' : 'manuell'}`}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="gaming-button is-ghost" onClick={() => onEdit(game)}>
            Bearbeiten
          </button>
          <button type="button" className="gaming-button is-ghost" onClick={() => onOpenProfile(game)}>
            Profil
          </button>
          <button type="button" className="gaming-button is-ghost" onClick={onOpenGuides}>
            Guides
          </button>
          <span className="gaming-spacer" />
          <button
            type="button"
            className={`gaming-button ${game.favorite ? 'is-warm' : 'is-ghost'}`}
            onClick={() => void gaming.updateGame(game.id, { favorite: !game.favorite })}
          >
            {game.favorite ? '★ Favorit' : '☆ Favorit'}
          </button>
          {active ? (
            <button type="button" className="gaming-button is-danger" onClick={() => void gaming.stop()}>
              Sitzung beenden
            </button>
          ) : (
            <button
              type="button"
              className="gaming-button is-primary"
              onClick={() => void gaming.launch(game.id)}
              disabled={Boolean(snapshot.activeSession)}
            >
              Spielen
            </button>
          )}
        </>
      }
    >
      <div className="gaming-detail-hero">
        <GameArt game={game} kind="hero" artwork={gaming.artwork} requestArtwork={gaming.requestArtwork} />
        <div className="gaming-detail-hero-shade" />
        <div className="gaming-detail-stats">
          <span>
            <small>SPIELZEIT</small>
            <strong>{formatPlaytime(game.playtimeSeconds)}</strong>
          </span>
          <span>
            <small>ZULETZT</small>
            <strong>{formatPlayedAt(game.lastPlayedAt)}</strong>
          </span>
          <span>
            <small>SITZUNGEN</small>
            <strong>{snapshot.sessions.filter((entry) => entry.gameId === game.id).length}</strong>
          </span>
          <span>
            <small>PROFIL</small>
            <strong>{profile ? (profile.autoActivate ? 'Auto' : 'Manuell') : 'Noch keins'}</strong>
          </span>
        </div>
      </div>
      <p className="gaming-detail-description">{game.description || 'Für dieses Spiel ist noch keine Beschreibung hinterlegt.'}</p>
      <div className="gaming-detail-columns">
        <div>
          <h4>Startweg</h4>
          <dl>
            <dt>Launcher</dt>
            <dd>{launcherLabel(game.launcher)}</dd>
            <dt>Datei</dt>
            <dd className={game.available === false ? 'is-warn' : ''}>{game.exe || game.uri || 'Nicht hinterlegt'}</dd>
            <dt>Prozess</dt>
            <dd>{game.process || 'Wird nach dem Start erkannt'}</dd>
            <dt>Parameter</dt>
            <dd>{game.args || 'Keine'}</dd>
          </dl>
        </div>
        <div>
          <h4>Letzte Sitzung</h4>
          {lastSession ? (
            <>
              <p>
                {new Date(lastSession.startedAt).toLocaleString('de-DE')} · {Math.round(lastSession.durationSeconds / 60)} Minuten
              </p>
              <p className="gaming-muted">
                CPU Ø {lastSession.avgCpu == null ? 'nicht verfügbar' : `${Math.round(lastSession.avgCpu)} %`} · GPU Ø{' '}
                {lastSession.avgGpu == null ? 'nicht verfügbar' : `${Math.round(lastSession.avgGpu)} %`} · max.{' '}
                {Math.max(lastSession.maxCpuTemp ?? 0, lastSession.maxGpuTemp ?? 0) || '—'} °C
              </p>
              {lastSession.anomalies.length ? <p className="is-warn">{lastSession.anomalies.join(' ')}</p> : null}
            </>
          ) : (
            <p className="gaming-muted">Noch keine Spielsitzung aufgezeichnet.</p>
          )}
          <h4>Verknüpfte Guides</h4>
          {guides.length ? (
            <ul className="gaming-link-list">
              {guides.slice(0, 4).map((guide) => (
                <li key={guide.id}>
                  <button type="button" onClick={() => void gaming.openGuide(guide.url)}>
                    {guide.title}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="gaming-muted">Noch keine Guides verknüpft.</p>
          )}
        </div>
      </div>
    </GamingModal>
  );
}
