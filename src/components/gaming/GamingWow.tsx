import { useState } from 'react';
import type { GamingState } from '../../hooks/useGaming';
import type { WowCharacter, WowEvent } from '../../lib/gaming';
import { GamingEmpty } from './GamingUi';
import { GamingGuides, GamingNews } from './GamingIntel';

type WowTab = 'overview' | 'news' | 'guides';

const KIND_LABEL: Record<WowEvent['kind'], string> = {
  raid: 'Raid',
  dungeon: 'Dungeon',
  event: 'Event',
};

function dateLabel(value: number): string {
  if (!value) return 'ohne Termin';
  return new Intl.DateTimeFormat('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function classList(entry: WowCharacter): string {
  return [entry.className, entry.spec].filter(Boolean).join(' · ') || 'Klasse offen';
}

export default function GamingWow({ gaming }: { gaming: GamingState }) {
  const snapshot = gaming.snapshot;
  const wow = snapshot.wow;
  const [tab, setTab] = useState<WowTab>('overview');
  const [launcherPath, setLauncherPath] = useState(wow.launcherPath);
  const [launcherArgs, setLauncherArgs] = useState(wow.launcherArgs);
  const [eventDraft, setEventDraft] = useState({ title: '', at: '', kind: 'raid' as WowEvent['kind'], note: '' });
  const [characterDraft, setCharacterDraft] = useState({ name: '', className: '', spec: '', realm: '', itemLevel: '', notes: '' });
  const [noteDraft, setNoteDraft] = useState('');
  const [message, setMessage] = useState('');

  const wowArticles = snapshot.articles.filter((article) => article.game === 'wow').slice(0, 4);
  const wowGuides = snapshot.guides.filter((guide) => guide.game === 'wow').slice(0, 4);
  const events = [...wow.events].sort((a, b) => a.at - b.at);

  const saveLauncher = async () => {
    const result = await gaming.saveWow({ launcherPath, launcherArgs });
    setMessage(result.ok ? 'WoW-Launcher gespeichert.' : result.error || 'Der Launcher konnte nicht gespeichert werden.');
  };

  const pickLauncher = async () => {
    const result = await gaming.pickFile('executable');
    if (result.ok && result.path) setLauncherPath(result.path);
  };

  const addEvent = async () => {
    if (!eventDraft.title.trim()) return;
    const at = eventDraft.at ? new Date(eventDraft.at).getTime() : Date.now();
    const next: WowEvent = {
      id: `event_${Date.now().toString(36)}`,
      title: eventDraft.title.trim(),
      at,
      kind: eventDraft.kind,
      note: eventDraft.note.trim(),
    };
    const result = await gaming.saveWow({ events: [...wow.events, next] });
    if (result.ok) {
      setEventDraft({ title: '', at: '', kind: 'raid', note: '' });
      setMessage('Termin gespeichert.');
    } else setMessage(result.error || 'Termin konnte nicht gespeichert werden.');
  };

  const addCharacter = async () => {
    if (!characterDraft.name.trim()) return;
    const next: WowCharacter = {
      id: `char_${Date.now().toString(36)}`,
      name: characterDraft.name.trim(),
      className: characterDraft.className.trim(),
      spec: characterDraft.spec.trim(),
      realm: characterDraft.realm.trim(),
      itemLevel: characterDraft.itemLevel ? Number(characterDraft.itemLevel) : null,
      notes: characterDraft.notes.trim(),
    };
    const result = await gaming.saveWow({ characters: [...wow.characters, next] });
    if (result.ok) {
      setCharacterDraft({ name: '', className: '', spec: '', realm: '', itemLevel: '', notes: '' });
      setMessage('Charakter gespeichert.');
    } else setMessage(result.error || 'Charakter konnte nicht gespeichert werden.');
  };

  const addNote = async () => {
    if (!noteDraft.trim()) return;
    const next = {
      id: `note_${Date.now().toString(36)}`,
      text: noteDraft.trim(),
      updatedAt: Date.now(),
    };
    const result = await gaming.saveWow({ notes: [...wow.notes, next] });
    if (result.ok) {
      setNoteDraft('');
      setMessage('Notiz gespeichert.');
    } else setMessage(result.error || 'Notiz konnte nicht gespeichert werden.');
  };

  return (
    <section className="gaming-view">
      <header className="gaming-view-head">
        <div>
          <span className="gaming-eyebrow">WOW FOREVER · KOMMANDOZENTRALE</span>
          <h2>World of Warcraft</h2>
          <p>Server-News, Guides, Raid-Termine, Charaktere und Notizen — lokal organisiert, deutschsprachig priorisiert.</p>
        </div>
        <div className="gaming-head-actions">
          <button type="button" className="gaming-button is-ghost" onClick={() => void gaming.refreshNews()} disabled={gaming.busy === 'news'}>
            News aktualisieren
          </button>
          <button type="button" className="gaming-button is-primary" onClick={() => void gaming.launchWow()} disabled={!wow.launcherPath || gaming.busy === 'wowLaunch'}>
            {gaming.busy === 'wowLaunch' ? 'Startet …' : 'WoW-Launcher starten'}
          </button>
        </div>
      </header>

      <nav className="gaming-subtabs" aria-label="WoW-Bereiche">
        {(
          [
            ['overview', 'Übersicht'],
            ['news', 'News'],
            ['guides', 'Guides'],
          ] as Array<[WowTab, string]>
        ).map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      {tab === 'news' ? <GamingNews gaming={gaming} scope="wow" /> : null}
      {tab === 'guides' ? <GamingGuides gaming={gaming} scope="wow" /> : null}
      {tab === 'overview' ? (
        <>
          <div className="gaming-wow-hero">
            <div className="gaming-wow-emblem" aria-hidden="true">
              <span>W</span>
            </div>
            <div>
              <small>WOW FOREVER</small>
              <strong>Deine Reise durch Azeroth</strong>
              <p>
                Alle Informationen stammen aus deinen hinterlegten Quellen. Ohne passende offizielle API bleibt der Hub bewusst bei
                manuell gepflegten Links und Terminen.
              </p>
            </div>
            <div className="gaming-wow-hero-stats">
              <span>
                <strong>{wow.characters.length}</strong>
                <small>Charaktere</small>
              </span>
              <span>
                <strong>{events.filter((event) => event.at > Date.now()).length}</strong>
                <small>Termine</small>
              </span>
              <span>
                <strong>{wowGuides.length}</strong>
                <small>Guides</small>
              </span>
            </div>
          </div>

          <div className="gaming-wow-grid">
            <section className="gaming-panel">
              <header>
                <div>
                  <span className="gaming-eyebrow">SCHNELLSTART</span>
                  <h3>Launcher</h3>
                </div>
              </header>
              <div className="gaming-form-grid">
                <label className="is-wide">
                  <span>Pfad zum WoW- oder Battle.net-Launcher</span>
                  <div className="gaming-input-row">
                    <input value={launcherPath} onChange={(event) => setLauncherPath(event.target.value)} placeholder="C:\…\Wow.exe" />
                    <button type="button" className="gaming-button is-ghost" onClick={() => void pickLauncher()}>
                      Wählen
                    </button>
                  </div>
                </label>
                <label className="is-wide">
                  <span>Startparameter</span>
                  <input value={launcherArgs} onChange={(event) => setLauncherArgs(event.target.value)} placeholder="Optional" />
                </label>
              </div>
              <div className="gaming-row-actions">
                <button type="button" className="gaming-button is-ghost is-small" onClick={() => void saveLauncher()}>
                  Speichern
                </button>
                <button
                  type="button"
                  className="gaming-button is-primary is-small"
                  onClick={() => void gaming.launchWow()}
                  disabled={!wow.launcherPath}
                >
                  Starten
                </button>
              </div>
              <p className="gaming-muted">
                Der Launcher wird ausschließlich mit validiertem Pfad gestartet. Es werden keine Addons, Dateien oder Spieldaten
                verändert.
              </p>
            </section>

            <section className="gaming-panel">
              <header>
                <div>
                  <span className="gaming-eyebrow">RAID &amp; EVENTS</span>
                  <h3>Persönliche Termine</h3>
                </div>
              </header>
              {events.length ? (
                <ul className="gaming-event-list">
                  {events.map((event) => (
                    <li key={event.id}>
                      <span className={`gaming-kind kind-${event.kind}`}>{KIND_LABEL[event.kind]}</span>
                      <div>
                        <strong>{event.title}</strong>
                        <small>{dateLabel(event.at)}</small>
                        {event.note ? <p>{event.note}</p> : null}
                      </div>
                      <button
                        type="button"
                        className="gaming-icon-button"
                        aria-label="Termin löschen"
                        onClick={() => void gaming.saveWow({ events: wow.events.filter((entry) => entry.id !== event.id) })}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="gaming-muted">Noch keine Raid- oder Dungeon-Termine eingetragen.</p>
              )}
              <div className="gaming-inline-form">
                <input
                  value={eventDraft.title}
                  onChange={(event) => setEventDraft({ ...eventDraft, title: event.target.value })}
                  placeholder="Titel des Termins"
                />
                <input
                  type="datetime-local"
                  value={eventDraft.at}
                  onChange={(event) => setEventDraft({ ...eventDraft, at: event.target.value })}
                />
                <select value={eventDraft.kind} onChange={(event) => setEventDraft({ ...eventDraft, kind: event.target.value as WowEvent['kind'] })}>
                  <option value="raid">Raid</option>
                  <option value="dungeon">Dungeon</option>
                  <option value="event">Event</option>
                </select>
                <button type="button" className="gaming-button is-ghost is-small" onClick={() => void addEvent()}>
                  + Termin
                </button>
              </div>
            </section>

            <section className="gaming-panel">
              <header>
                <div>
                  <span className="gaming-eyebrow">CHARAKTERE</span>
                  <h3>Deine Übersicht</h3>
                </div>
              </header>
              {wow.characters.length ? (
                <div className="gaming-character-list">
                  {wow.characters.map((character) => (
                    <article key={character.id}>
                      <div className="gaming-character-mark">{character.name.slice(0, 1).toUpperCase()}</div>
                      <div>
                        <strong>{character.name}</strong>
                        <small>
                          {classList(character)} {character.itemLevel ? `· ilvl ${character.itemLevel}` : ''}
                        </small>
                        <span>{character.realm || 'Server nicht hinterlegt'}</span>
                        {character.notes ? <p>{character.notes}</p> : null}
                      </div>
                      <button
                        type="button"
                        className="gaming-icon-button"
                        aria-label="Charakter löschen"
                        onClick={() => void gaming.saveWow({ characters: wow.characters.filter((entry) => entry.id !== character.id) })}
                      >
                        ×
                      </button>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="gaming-muted">Noch keine Charaktere hinterlegt.</p>
              )}
              <div className="gaming-inline-form is-multi">
                <input value={characterDraft.name} onChange={(event) => setCharacterDraft({ ...characterDraft, name: event.target.value })} placeholder="Name" />
                <input value={characterDraft.className} onChange={(event) => setCharacterDraft({ ...characterDraft, className: event.target.value })} placeholder="Klasse" />
                <input value={characterDraft.spec} onChange={(event) => setCharacterDraft({ ...characterDraft, spec: event.target.value })} placeholder="Spezialisierung" />
                <input value={characterDraft.realm} onChange={(event) => setCharacterDraft({ ...characterDraft, realm: event.target.value })} placeholder="Server" />
                <input
                  value={characterDraft.itemLevel}
                  onChange={(event) => setCharacterDraft({ ...characterDraft, itemLevel: event.target.value })}
                  placeholder="ilvl"
                  inputMode="numeric"
                />
                <button type="button" className="gaming-button is-ghost is-small" onClick={() => void addCharacter()}>
                  + Charakter
                </button>
              </div>
            </section>

            <section className="gaming-panel">
              <header>
                <div>
                  <span className="gaming-eyebrow">NOTIZEN</span>
                  <h3>Persönliche Notizen</h3>
                </div>
              </header>
              {wow.notes.length ? (
                <ul className="gaming-note-list">
                  {wow.notes.map((note) => (
                    <li key={note.id}>
                      <p>{note.text}</p>
                      <small>{new Date(note.updatedAt).toLocaleString('de-DE')}</small>
                      <button
                        type="button"
                        className="gaming-icon-button"
                        aria-label="Notiz löschen"
                        onClick={() => void gaming.saveWow({ notes: wow.notes.filter((entry) => entry.id !== note.id) })}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="gaming-muted">Noch keine Notizen.</p>
              )}
              <div className="gaming-inline-form">
                <textarea value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} rows={2} placeholder="z. B. Raid-Vorbereitung, Mats, Taktik …" />
                <button type="button" className="gaming-button is-ghost is-small" onClick={() => void addNote()}>
                  + Notiz
                </button>
              </div>
            </section>
          </div>

          <div className="gaming-wow-lists">
            <section className="gaming-panel">
              <header>
                <div>
                  <span className="gaming-eyebrow">AUS DEN QUELLEN</span>
                  <h3>Aktuelle WoW-Meldungen</h3>
                </div>
                <button type="button" className="gaming-button is-ghost is-small" onClick={() => setTab('news')}>
                  Alle News
                </button>
              </header>
              {wowArticles.length ? (
                <ul className="gaming-link-list">
                  {wowArticles.map((article) => (
                    <li key={article.id}>
                      <button type="button" onClick={() => void gaming.openGuide(article.url)}>
                        {article.title}
                      </button>
                      <small>{article.sourceName}</small>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="gaming-muted">Noch keine WoW-Quellen geladen. Konfiguriere einen RSS-Feed im News-Bereich.</p>
              )}
            </section>
            <section className="gaming-panel">
              <header>
                <div>
                  <span className="gaming-eyebrow">WISSEN</span>
                  <h3>WoW-Guides</h3>
                </div>
                <button type="button" className="gaming-button is-ghost is-small" onClick={() => setTab('guides')}>
                  Alle Guides
                </button>
              </header>
              {wowGuides.length ? (
                <ul className="gaming-link-list">
                  {wowGuides.map((guide) => (
                    <li key={guide.id}>
                      <button type="button" onClick={() => void gaming.openGuide(guide.url)}>
                        {guide.title}
                      </button>
                      <small>{guide.category}</small>
                    </li>
                  ))}
                </ul>
              ) : (
                <GamingEmpty title="Noch keine WoW-Guides" text="Lege im Guides-Bereich Links zu Raid-, Dungeon- oder Klassen-Guides an." />
              )}
            </section>
          </div>
          {message ? <p className="gaming-form-message">{message}</p> : null}
        </>
      ) : null}
    </section>
  );
}
