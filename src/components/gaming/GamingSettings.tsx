import { launcherLabel } from '../../lib/gaming';
import type { GamingState } from '../../hooks/useGaming';
import { GamingToggle } from './GamingUi';

export default function GamingSettings({ gaming }: { gaming: GamingState }) {
  const snapshot = gaming.snapshot;
  const settings = snapshot.settings;
  const active = snapshot.activeSession;

  return (
    <section className="gaming-view">
      <header className="gaming-view-head">
        <div>
          <span className="gaming-eyebrow">GAMING HUB · EINSTELLUNGEN</span>
          <h2>Gaming Protocol &amp; System</h2>
          <p>Alle automatischen Aktionen sind einzeln abschaltbar. Der Gaming-Modus nutzt die bestehende Automation Engine.</p>
        </div>
        <div className={`gaming-protocol-pill ${snapshot.automationEnabled ? 'is-on' : ''}`}>
          <span />
          <div>
            <small>AUTOMATION</small>
            <strong>{snapshot.automationEnabled ? `AKTIV · ${snapshot.automationMode}` : 'DEAKTIVIERT'}</strong>
          </div>
        </div>
      </header>

      <div className="gaming-settings-layout">
        <section className="gaming-panel">
          <header>
            <div>
              <span className="gaming-eyebrow">PROTOKOLL</span>
              <h3>Gaming Protocol</h3>
            </div>
          </header>
          <div className="gaming-toggle-list">
            <GamingToggle
              label="Gaming-Modus automatisch aktivieren"
              hint="Reduziert Animationen und priorisiert das Monitoring, solange ein Spiel läuft."
              checked={settings.autoGamingMode}
              onChange={(next) => void gaming.updateSettings({ autoGamingMode: next })}
            />
            <GamingToggle
              label="Spielprofil automatisch laden"
              hint="Lautstärke, Routine und Profil werden beim Start übernommen."
              checked={settings.autoProfile}
              onChange={(next) => void gaming.updateSettings({ autoProfile: next })}
            />
            <GamingToggle
              label="Spielsitzungen automatisch erkennen"
              hint="Nutzt den bestehenden Prozess-Kontext der Automation Engine, keinen zweiten Scanner."
              checked={settings.autoSession}
              onChange={(next) => void gaming.updateSettings({ autoSession: next })}
            />
            <GamingToggle
              label="Sitzungsbericht erstellen"
              hint="Lokale Zusammenfassung nach dem Beenden, inklusive historischem Vergleich."
              checked={settings.autoReport}
              onChange={(next) => void gaming.updateSettings({ autoReport: next })}
            />
            <GamingToggle
              label="Benachrichtigungen reduzieren"
              hint="Während einer Sitzung nur wichtige Hinweise."
              checked={settings.reducedNotifications}
              onChange={(next) => void gaming.updateSettings({ reducedNotifications: next })}
            />
          </div>
          <div className="gaming-protocol-flow">
            <span>Spielstart erkannt</span>
            <i>→</i>
            <span>Profil laden</span>
            <i>→</i>
            <span>Gaming Mode</span>
            <i>→</i>
            <span>Monitoring &amp; Sitzung</span>
            <i>→</i>
            <span>Bericht &amp; Wiederherstellung</span>
          </div>
          {active ? (
            <p className="gaming-muted">
              Aktive Sitzung: {active.gameName} · Modus {active.modeActive ? 'aktiv' : 'nicht aktiv'} ·{' '}
              {active.profileId ? 'Profil geladen' : 'ohne Profil'}
            </p>
          ) : null}
        </section>

        <section className="gaming-panel">
          <header>
            <div>
              <span className="gaming-eyebrow">ERKENNUNG</span>
              <h3>Launcher &amp; Intervalle</h3>
            </div>
          </header>
          <div className="gaming-toggle-list">
            <GamingToggle
              label="Launcher automatisch erkennen"
              hint="Steam, Epic, Battle.net, GOG, Ubisoft und EA lokal auslesen."
              checked={settings.autoDetect}
              onChange={(next) => void gaming.updateSettings({ autoDetect: next })}
            />
          </div>
          <div className="gaming-form-grid">
            <label>
              <span>Messintervall</span>
              <select
                value={settings.sessionSampleSeconds}
                onChange={(event) => void gaming.updateSettings({ sessionSampleSeconds: Number(event.target.value) })}
              >
                {[5, 10, 15, 20, 30, 45, 60].map((value) => (
                  <option key={value} value={value}>
                    alle {value} Sekunden
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>News-Aktualisierung</span>
              <select
                value={settings.newsRefreshMinutes}
                onChange={(event) => void gaming.updateSettings({ newsRefreshMinutes: Number(event.target.value) })}
              >
                {[15, 30, 60, 120, 240].map((value) => (
                  <option key={value} value={value}>
                    alle {value} Minuten
                  </option>
                ))}
              </select>
              <small>Nur solange eine aktive Quelle konfiguriert ist.</small>
            </label>
          </div>
          <div className="gaming-detection">
            <div className="gaming-detection-meta">
              <span>{snapshot.detection.message}</span>
              <small>
                {snapshot.detection.lastAt
                  ? `Zuletzt: ${new Date(snapshot.detection.lastAt).toLocaleString('de-DE')}`
                  : 'Noch nicht ausgeführt'}
              </small>
            </div>
            <button type="button" className="gaming-button is-ghost is-small" onClick={() => void gaming.detect()} disabled={gaming.busy === 'detect'}>
              Jetzt scannen
            </button>
          </div>
          <div className="gaming-launchers">
            {snapshot.detection.launchers.length ? (
              snapshot.detection.launchers.map((launcher) => (
                <span key={launcher.id} className={launcher.detected ? 'is-on' : ''}>
                  <i />
                  {launcherLabel(launcher.id)}
                  <small>{launcher.detected ? 'gefunden' : 'nicht gefunden'}</small>
                </span>
              ))
            ) : (
              <p className="gaming-muted">Noch keine Launcher-Erkennung ausgeführt.</p>
            )}
          </div>
        </section>

        <section className="gaming-panel">
          <header>
            <div>
              <span className="gaming-eyebrow">COMPANION</span>
              <h3>Kompakter Gaming Companion</h3>
            </div>
          </header>
          <div className="gaming-toggle-list">
            <GamingToggle
              label="Companion aktivieren"
              hint="Eigenes, verschiebbares und skalierbares Fenster. Keine DLL-Injection, kein Eingriff in Spiele."
              checked={settings.companionEnabled}
              onChange={(next) => {
                if (next) void gaming.openCompanion();
                else void gaming.disableCompanion();
              }}
            />
            <GamingToggle
              label="Automatisch bei Spielstart zeigen"
              hint="Nur wenn der Companion aktiviert ist."
              checked={settings.companionAutoShow}
              disabled={!settings.companionEnabled}
              onChange={(next) => void gaming.updateSettings({ companionAutoShow: next })}
            />
          </div>
          <div className="gaming-companion-actions">
            <span className={snapshot.companionOpen ? 'is-live' : ''}>
              <i />
              {snapshot.companionOpen ? 'Fenster ist offen' : 'Fenster ist geschlossen'}
            </span>
            <button type="button" className="gaming-button is-ghost is-small" onClick={() => void gaming.openCompanion()}>
              Companion öffnen
            </button>
            <button type="button" className="gaming-button is-ghost is-small" onClick={() => void gaming.closeCompanion()}>
              Ausblenden
            </button>
          </div>
        </section>

        <section className="gaming-panel">
          <header>
            <div>
              <span className="gaming-eyebrow">DATEN</span>
              <h3>Lokale Speicherung</h3>
            </div>
          </header>
          <p className="gaming-muted">
            Bibliothek, Profile, Quellen, Guides, WoW-Notizen und Sitzungsberichte liegen ausschließlich lokal in deinem
            J.A.R.V.I.S.-Benutzerprofil. Bilder werden im Ordner „gaming-assets“ zwischengespeichert.
          </p>
          <dl className="gaming-data-list">
            <div>
              <dt>Spiele</dt>
              <dd>{snapshot.games.length}</dd>
            </div>
            <div>
              <dt>Profile</dt>
              <dd>{snapshot.profiles.length}</dd>
            </div>
            <div>
              <dt>Sitzungen</dt>
              <dd>{snapshot.sessions.length}</dd>
            </div>
            <div>
              <dt>Quellen</dt>
              <dd>{snapshot.sources.length}</dd>
            </div>
          </dl>
          <div className="gaming-row-actions">
            <button
              type="button"
              className="gaming-button is-danger is-small"
              onClick={() => {
                if (window.confirm('Sitzungshistorie vollständig löschen? Die Spielbibliothek bleibt erhalten.')) {
                  void gaming.clearSessions();
                }
              }}
            >
              Sitzungshistorie löschen
            </button>
          </div>
        </section>
      </div>
    </section>
  );
}
