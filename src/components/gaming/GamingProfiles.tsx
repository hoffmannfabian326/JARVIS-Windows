import { useRef, useState, type ChangeEvent } from 'react';
import type { AutomationRoutine } from '../../lib/automation';
import {
  GAMING_LAUNCHERS,
  LAYOUT_LABELS,
  NOTIFICATION_LABELS,
  emptyProfile,
  type GamingGame,
  type GamingLayout,
  type GamingNotificationMode,
  type GamingProfile,
} from '../../lib/gaming';
import type { GamingState } from '../../hooks/useGaming';
import { GameArt, GamingEmpty, GamingToggle } from './GamingUi';

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Bild konnte nicht gelesen werden.'));
    reader.readAsDataURL(file);
  });
}

export default function GamingProfiles({
  gaming,
  routines,
  initialGameId,
}: {
  gaming: GamingState;
  routines: AutomationRoutine[];
  initialGameId?: string;
}) {
  const snapshot = gaming.snapshot;
  const games = snapshot.games;
  const firstId = initialGameId || snapshot.settings.selectedGameId || snapshot.activeSession?.gameId || games[0]?.id || '';
  const [gameId, setGameId] = useState(firstId);
  const initialGame = games.find((game) => game.id === firstId);
  const initialProfile =
    snapshot.profiles.find((profile) => profile.gameId === firstId) ||
    (initialGame ? emptyProfile(initialGame.id, initialGame.launcher) : null);
  const [draft, setDraft] = useState<GamingProfile | null>(initialProfile);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const coverInput = useRef<HTMLInputElement | null>(null);
  const heroInput = useRef<HTMLInputElement | null>(null);
  const game = games.find((entry) => entry.id === gameId);

  const chooseGame = (id: string) => {
    const selected = games.find((entry) => entry.id === id);
    if (!selected) return;
    setGameId(id);
    setMessage('');
    setDraft(snapshot.profiles.find((profile) => profile.gameId === id) || emptyProfile(selected.id, selected.launcher));
  };

  const update = <K extends keyof GamingProfile>(key: K, value: GamingProfile[K]) => {
    setDraft((current) => (current ? { ...current, [key]: value, updatedAt: Date.now() } : current));
  };

  const upload = async (file: File | undefined, key: 'coverAsset' | 'backgroundAsset') => {
    if (!file || !draft) return;
    if (file.size > 6 * 1024 * 1024) {
      setMessage('Bitte ein Bild unter 6 MB wählen.');
      return;
    }
    try {
      const result = await gaming.uploadAsset(await readFile(file));
      if (!result.ok || !result.path) {
        setMessage(result.error || 'Das Bild konnte nicht gespeichert werden.');
        return;
      }
      update(key, result.path);
      setMessage('Bild hochgeladen. Profil speichern, um es zu übernehmen.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Das Bild konnte nicht gelesen werden.');
    }
  };

  const save = async () => {
    if (!draft || !game) return;
    setSaving(true);
    setMessage('');
    const result = await gaming.saveProfile({ ...draft, gameId: game.id, launcher: draft.launcher });
    setSaving(false);
    if (!result.ok) {
      setMessage(result.error || 'Das Profil konnte nicht gespeichert werden.');
      return;
    }
    const saved = result.snapshot?.profiles.find((profile) => profile.gameId === game.id);
    if (saved) setDraft(saved);
    setMessage('Gaming-Profil gespeichert.');
  };

  const remove = async () => {
    if (!draft) return;
    if (!snapshot.profiles.some((profile) => profile.id === draft.id)) return;
    if (!window.confirm(`Profil für ${game?.name || 'dieses Spiel'} löschen?`)) return;
    const result = await gaming.deleteProfile(draft.id);
    if (!result.ok) {
      setMessage(result.error || 'Das Profil konnte nicht gelöscht werden.');
      return;
    }
    if (game) setDraft(emptyProfile(game.id, game.launcher));
    setMessage('Profil gelöscht.');
  };

  if (!games.length) {
    return (
      <section className="gaming-view">
        <header className="gaming-view-head">
          <div>
            <span className="gaming-eyebrow">GAMING PROFILES</span>
            <h2>Spielprofile</h2>
            <p>Für jedes Spiel lassen sich Launcher, Layout, Monitoring, Guides und Automationen bündeln.</p>
          </div>
        </header>
        <GamingEmpty title="Noch keine Spiele" text="Sobald ein Spiel in der Bibliothek liegt, kann ein Profil angelegt werden." />
      </section>
    );
  }

  const existing = Boolean(draft && snapshot.profiles.some((profile) => profile.id === draft.id));
  const linkedGuides = snapshot.guides;
  const linkedSources = snapshot.sources;

  return (
    <section className="gaming-view">
      <header className="gaming-view-head">
        <div>
          <span className="gaming-eyebrow">GAMING PROFILES · AUTOMATISIERUNG</span>
          <h2>Gaming Profiles</h2>
          <p>Beim Spielstart kann das Profil automatisch aktiviert werden — Lautstärke, Routine und Monitoring inklusive.</p>
        </div>
        <div className="gaming-head-actions">
          <select value={gameId} onChange={(event) => chooseGame(event.target.value)} aria-label="Spiel für Profil wählen">
            {games.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
                {snapshot.profiles.some((profile) => profile.gameId === entry.id) ? ' · Profil' : ''}
              </option>
            ))}
          </select>
          <button type="button" className="gaming-button is-primary" onClick={() => void save()} disabled={saving || !draft}>
            {saving ? 'Speichert …' : 'Profil speichern'}
          </button>
        </div>
      </header>

      {!draft || !game ? null : (
        <div className="gaming-profile-layout">
          <aside className="gaming-profile-side">
            <div className="gaming-profile-preview">
              <GameArt game={game as GamingGame} kind="hero" artwork={gaming.artwork} requestArtwork={gaming.requestArtwork} />
              <div>
                <small>PROFIL FÜR</small>
                <strong>{game.name}</strong>
                <span>{existing ? 'Gespeichertes Profil' : 'Neues Profil'}</span>
              </div>
            </div>
            <div className="gaming-profile-list">
              {snapshot.games.map((entry) => {
                const profile = snapshot.profiles.find((item) => item.gameId === entry.id);
                return (
                  <button key={entry.id} type="button" className={entry.id === gameId ? 'is-active' : ''} onClick={() => chooseGame(entry.id)}>
                    <span>{entry.name}</span>
                    <small>{profile ? (profile.autoActivate ? 'Auto' : 'Manuell') : 'Kein Profil'}</small>
                  </button>
                );
              })}
            </div>
            {existing ? (
              <button type="button" className="gaming-button is-danger is-small" onClick={() => void remove()}>
                Profil löschen
              </button>
            ) : null}
          </aside>

          <div className="gaming-profile-form">
            <section className="gaming-panel">
              <header>
                <div>
                  <span className="gaming-eyebrow">START</span>
                  <h3>Launcher &amp; Parameter</h3>
                </div>
              </header>
              <div className="gaming-form-grid">
                <label>
                  <span>Launcher im Profil</span>
                  <select value={draft.launcher} onChange={(event) => update('launcher', event.target.value as GamingProfile['launcher'])}>
                    {GAMING_LAUNCHERS.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Layout</span>
                  <select value={draft.layout} onChange={(event) => update('layout', event.target.value as GamingLayout)}>
                    {Object.entries(LAYOUT_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="is-wide">
                  <span>Startparameter</span>
                  <input value={draft.args} onChange={(event) => update('args', event.target.value)} placeholder="-windowed -console" />
                </label>
                <label>
                  <span>Benachrichtigungen</span>
                  <select value={draft.notifications} onChange={(event) => update('notifications', event.target.value as GamingNotificationMode)}>
                    {Object.entries(NOTIFICATION_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="gaming-check-stack">
                  <GamingToggle
                    label="Profil automatisch aktivieren"
                    hint="Beim Start dieses Spiels laden"
                    checked={draft.autoActivate}
                    onChange={(next) => update('autoActivate', next)}
                  />
                  <GamingToggle
                    label="Hardware-Monitoring"
                    hint="Werte nur mit erteilter Systemfreigabe"
                    checked={draft.hardwareMonitoring}
                    onChange={(next) => update('hardwareMonitoring', next)}
                  />
                </div>
              </div>
            </section>

            <section className="gaming-panel">
              <header>
                <div>
                  <span className="gaming-eyebrow">AUTOMATION</span>
                  <h3>Routine &amp; Audio</h3>
                </div>
              </header>
              <div className="gaming-form-grid">
                <label>
                  <span>Automationsroutine</span>
                  <select value={draft.automationRoutineId} onChange={(event) => update('automationRoutineId', event.target.value)}>
                    <option value="">Keine Routine</option>
                    {routines.map((routine) => (
                      <option key={routine.id} value={routine.id}>
                        {routine.name}
                        {routine.enabled ? '' : ' (deaktiviert)'}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="gaming-check-stack">
                  <GamingToggle
                    label="Routine beim Start ausführen"
                    hint="Nur wenn Automationen aktiv sind"
                    checked={draft.autoRoutine}
                    onChange={(next) => update('autoRoutine', next)}
                  />
                  <GamingToggle
                    label="Lautstärke setzen"
                    checked={draft.applyVolume}
                    onChange={(next) => update('applyVolume', next)}
                  />
                </div>
                <label>
                  <span>Ziel-Lautstärke</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={draft.audioPercent ?? 50}
                    onChange={(event) => update('audioPercent', Number(event.target.value))}
                    disabled={!draft.applyVolume}
                  />
                  <small>{draft.audioPercent ?? 50} %</small>
                </label>
              </div>
            </section>

            <section className="gaming-panel">
              <header>
                <div>
                  <span className="gaming-eyebrow">INHALTE</span>
                  <h3>Guides &amp; Quellen</h3>
                </div>
              </header>
              <div className="gaming-link-columns">
                <div>
                  <h4>Guides</h4>
                  {linkedGuides.length ? (
                    linkedGuides.map((guide) => (
                      <label key={guide.id} className="gaming-check">
                        <input
                          type="checkbox"
                          checked={draft.guideIds.includes(guide.id)}
                          onChange={(event) =>
                            update(
                              'guideIds',
                              event.target.checked ? [...draft.guideIds, guide.id] : draft.guideIds.filter((id) => id !== guide.id),
                            )
                          }
                        />
                        <span>{guide.title}</span>
                      </label>
                    ))
                  ) : (
                    <p className="gaming-muted">Noch keine Guides angelegt.</p>
                  )}
                </div>
                <div>
                  <h4>Informationsquellen</h4>
                  {linkedSources.length ? (
                    linkedSources.map((source) => (
                      <label key={source.id} className="gaming-check">
                        <input
                          type="checkbox"
                          checked={draft.sourceIds.includes(source.id)}
                          onChange={(event) =>
                            update(
                              'sourceIds',
                              event.target.checked ? [...draft.sourceIds, source.id] : draft.sourceIds.filter((id) => id !== source.id),
                            )
                          }
                        />
                        <span>{source.name}</span>
                      </label>
                    ))
                  ) : (
                    <p className="gaming-muted">Noch keine Quellen konfiguriert.</p>
                  )}
                </div>
              </div>
            </section>

            <section className="gaming-panel">
              <header>
                <div>
                  <span className="gaming-eyebrow">AUSSEHEN</span>
                  <h3>Artwork</h3>
                </div>
              </header>
              <div className="gaming-asset-row">
                <div>
                  <span>Eigenes Cover</span>
                  <button type="button" className="gaming-button is-ghost" onClick={() => coverInput.current?.click()}>
                    {draft.coverAsset ? 'Cover ersetzen' : 'Cover wählen'}
                  </button>
                  <small>{draft.coverAsset || 'Kein eigenes Cover'}</small>
                </div>
                <div>
                  <span>Hintergrundbild</span>
                  <button type="button" className="gaming-button is-ghost" onClick={() => heroInput.current?.click()}>
                    {draft.backgroundAsset ? 'Hintergrund ersetzen' : 'Hintergrund wählen'}
                  </button>
                  <small>{draft.backgroundAsset || 'Kein eigener Hintergrund'}</small>
                </div>
                <input
                  ref={coverInput}
                  hidden
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event: ChangeEvent<HTMLInputElement>) => void upload(event.target.files?.[0], 'coverAsset')}
                />
                <input
                  ref={heroInput}
                  hidden
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event: ChangeEvent<HTMLInputElement>) => void upload(event.target.files?.[0], 'backgroundAsset')}
                />
              </div>
            </section>

            {message ? <p className="gaming-form-message">{message}</p> : null}
          </div>
        </div>
      )}
    </section>
  );
}
