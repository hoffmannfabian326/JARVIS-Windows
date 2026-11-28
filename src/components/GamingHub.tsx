import { useEffect, useState } from 'react';
import type { AutomationState } from '../hooks/useAutomation';
import type { GamingState } from '../hooks/useGaming';
import type { GamingGame } from '../lib/gaming';
import GameEditor from './gaming/GameEditor';
import { GamingGameDetail, GamingLibrary } from './gaming/GamingLibrary';
import GamingOverview from './gaming/GamingOverview';
import GamingPerformance from './gaming/GamingPerformance';
import GamingProfiles from './gaming/GamingProfiles';
import GamingSettings from './gaming/GamingSettings';
import GamingWow from './gaming/GamingWow';
import { GamingGuides, GamingNews } from './gaming/GamingIntel';

export type GamingTab =
  | 'overview'
  | 'library'
  | 'recent'
  | 'favorites'
  | 'news'
  | 'guides'
  | 'performance'
  | 'profiles'
  | 'wow'
  | 'settings';

const NAV: Array<{ id: GamingTab; label: string; icon: string; group: 'spielen' | 'inhalte' | 'system' }> = [
  { id: 'overview', label: 'Gaming Overview', icon: '◉', group: 'spielen' },
  { id: 'library', label: 'Spielebibliothek', icon: '▦', group: 'spielen' },
  { id: 'recent', label: 'Zuletzt gespielt', icon: '◷', group: 'spielen' },
  { id: 'favorites', label: 'Favoriten', icon: '★', group: 'spielen' },
  { id: 'news', label: 'Gaming News', icon: '◈', group: 'inhalte' },
  { id: 'guides', label: 'Guides', icon: '❖', group: 'inhalte' },
  { id: 'wow', label: 'WoW Forever', icon: 'W', group: 'inhalte' },
  { id: 'performance', label: 'Performance', icon: '⌁', group: 'system' },
  { id: 'profiles', label: 'Gaming Profiles', icon: '⬡', group: 'system' },
  { id: 'settings', label: 'Einstellungen', icon: '⚙', group: 'system' },
];

const TITLES: Record<GamingTab, string> = {
  overview: 'Gaming Overview',
  library: 'Spielebibliothek',
  recent: 'Zuletzt gespielt',
  favorites: 'Favoriten',
  news: 'Gaming News',
  guides: 'Guides',
  performance: 'Performance',
  profiles: 'Gaming Profiles',
  wow: 'World of Warcraft',
  settings: 'Einstellungen',
};

export default function GamingHub({
  open,
  initialTab = 'overview',
  gaming,
  automation,
  onClose,
}: {
  open: boolean;
  initialTab?: GamingTab;
  gaming: GamingState;
  automation: AutomationState;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<GamingTab>(initialTab);
  const [editing, setEditing] = useState<GamingGame | 'new' | null>(null);
  const [detail, setDetail] = useState<GamingGame | null>(null);
  const [profileGameId, setProfileGameId] = useState<string | undefined>();

  useEffect(() => {
    if (open) setTab(initialTab);
    else {
      setEditing(null);
      setDetail(null);
      setProfileGameId(undefined);
    }
  }, [initialTab, open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !editing && !detail) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, editing, detail, onClose]);

  const layoutProfile = gaming.snapshot.profiles.find(
    (profile) => profile.gameId === (gaming.snapshot.activeSession?.gameId || gaming.snapshot.settings.selectedGameId),
  );
  const layout = layoutProfile?.layout || 'cinematic';

  const navigate = (next: GamingTab) => {
    setDetail(null);
    setEditing(null);
    setTab(next);
  };

  return (
    <div className={`gaming-overlay ${open ? 'is-open' : ''}`} aria-hidden={!open}>
      <div className="gaming-backdrop" onClick={onClose} />
      <section className={`gaming-shell layout-${layout}`} role="dialog" aria-modal="true" aria-label="Gaming Hub">
        <aside className="gaming-sidebar">
          <div className="gaming-brand">
            <span className="gaming-brand-mark" aria-hidden="true">
              <span>J</span>
              <i />
            </span>
            <div>
              <small>J.A.R.V.I.S.</small>
              <strong>GAMING HUB</strong>
            </div>
          </div>

          <nav className="gaming-nav" aria-label="Gaming Hub Navigation">
            {(['spielen', 'inhalte', 'system'] as const).map((group) => (
              <div key={group} className="gaming-nav-group">
                <span>{group === 'spielen' ? 'SPIELEN' : group === 'inhalte' ? 'INHALTE' : 'SYSTEM'}</span>
                {NAV.filter((entry) => entry.group === group).map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={tab === entry.id ? 'is-active' : ''}
                    onClick={() => navigate(entry.id)}
                  >
                    <i aria-hidden="true" className={entry.id === 'wow' ? 'is-wow' : ''}>
                      {entry.icon}
                    </i>
                    <span>{entry.label}</span>
                    {entry.id === 'wow' && gaming.snapshot.activeSession ? <b className="gaming-nav-live" /> : null}
                  </button>
                ))}
              </div>
            ))}
          </nav>

          <div className="gaming-sidebar-foot">
            <div className="gaming-side-status">
              <span className={gaming.snapshot.activeSession ? 'is-live' : ''} />
              <div>
                <small>{gaming.snapshot.activeSession ? 'SITZUNG AKTIV' : 'BEREIT'}</small>
                <strong>{gaming.snapshot.activeSession?.gameName || 'Kein Spiel gestartet'}</strong>
              </div>
            </div>
            <div className="gaming-side-actions">
              <button type="button" onClick={() => void gaming.openCompanion()}>
                Companion
              </button>
              <button type="button" onClick={onClose}>
                Schließen
              </button>
            </div>
            <p className="gaming-side-note">
              {gaming.snapshot.detection.lastAt
                ? `Erkennung: ${new Date(gaming.snapshot.detection.lastAt).toLocaleTimeString('de-DE')}`
                : 'Erkennung noch nicht gelaufen'}
            </p>
          </div>
        </aside>

        <main className="gaming-main">
          <header className="gaming-topline">
            <div>
              <span className="gaming-eyebrow">GAMING COMMAND · {gaming.snapshot.automationMode.toUpperCase()}</span>
              <strong>{TITLES[tab]}</strong>
            </div>
            <div className="gaming-topline-actions">
              {gaming.snapshot.activeSession ? (
                <span className="gaming-top-live">
                  <i />
                  {gaming.snapshot.activeSession.gameName} · {Math.floor(gaming.snapshot.activeSession.elapsedSeconds / 60)} Min
                </span>
              ) : null}
              <button type="button" className="gaming-top-button" onClick={() => void gaming.refresh()} aria-label="Gaming-Daten aktualisieren">
                ↻
              </button>
              <button type="button" className="gaming-top-button" onClick={onClose} aria-label="Gaming Hub schließen">
                ×
              </button>
            </div>
          </header>

          {gaming.notice ? (
            <div className="gaming-notice" role="status">
              <span>{gaming.notice}</span>
              <button type="button" onClick={gaming.dismissNotice} aria-label="Hinweis schließen">
                ×
              </button>
            </div>
          ) : null}

          {gaming.error ? (
            <div className="gaming-error" role="alert">
              <strong>Gaming-Dienst</strong>
              <span>{gaming.error}</span>
              <button type="button" onClick={() => void gaming.refresh()}>
                Erneut versuchen
              </button>
            </div>
          ) : null}

          {!gaming.supported ? (
            <div className="gaming-browser-note">
              <strong>Eingeschränkte Vorschau</strong>
              <span>
                Spieleerkennung, Starts, Live-Monitoring und lokale Speicherung sind ausschließlich in der J.A.R.V.I.S.-Desktop-App
                verfügbar. In der Browser-Vorschau bleibt der Hub schreibgeschützt.
              </span>
            </div>
          ) : null}

          <div className="gaming-content">
            {gaming.loading ? (
              <div className="gaming-loading">
                <span />
                <p>Gaming-Bibliothek wird geladen …</p>
              </div>
            ) : null}

            {!gaming.loading && tab === 'overview' ? (
              <GamingOverview gaming={gaming} onNavigate={(target) => navigate(target)} onInspect={setDetail} onAdd={() => setEditing('new')} />
            ) : null}
            {!gaming.loading && (tab === 'library' || tab === 'recent' || tab === 'favorites') ? (
              <GamingLibrary
                gaming={gaming}
                preset={tab === 'recent' ? 'recent' : tab === 'favorites' ? 'favorites' : 'all'}
                onInspect={setDetail}
                onAdd={() => setEditing('new')}
                onEdit={(game) => setEditing(game)}
              />
            ) : null}
            {!gaming.loading && tab === 'news' ? <GamingNews gaming={gaming} /> : null}
            {!gaming.loading && tab === 'guides' ? <GamingGuides gaming={gaming} /> : null}
            {!gaming.loading && tab === 'performance' ? <GamingPerformance gaming={gaming} /> : null}
            {!gaming.loading && tab === 'profiles' ? (
              <GamingProfiles gaming={gaming} routines={automation.routines} initialGameId={profileGameId} />
            ) : null}
            {!gaming.loading && tab === 'wow' ? <GamingWow gaming={gaming} /> : null}
            {!gaming.loading && tab === 'settings' ? <GamingSettings gaming={gaming} /> : null}
          </div>
        </main>
      </section>

      {editing ? (
        <GameEditor
          gaming={gaming}
          game={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {detail ? (
        <GamingGameDetail
          gaming={gaming}
          game={detail}
          onClose={() => setDetail(null)}
          onEdit={(game) => {
            setDetail(null);
            setEditing(game);
          }}
          onOpenGuides={() => navigate('guides')}
          onOpenProfile={(game) => {
            setProfileGameId(game.id);
            setDetail(null);
            setTab('profiles');
          }}
        />
      ) : null}
    </div>
  );
}
