import { useState } from 'react';
import {
  formatBytes,
  formatMetric,
  formatNetwork,
  formatSessionDuration,
  sessionSummary,
  type GamingSession,
} from '../../lib/gaming';
import type { GamingState } from '../../hooks/useGaming';
import { GamingEmpty, GamingMetric, Sparkline } from './GamingUi';

export default function GamingPerformance({ gaming }: { gaming: GamingState }) {
  const snapshot = gaming.snapshot;
  const active = snapshot.activeSession;
  const timeline = active?.timeline ?? [];
  const [expanded, setExpanded] = useState('');
  const sessions = snapshot.sessions;

  return (
    <section className="gaming-view">
      <header className="gaming-view-head">
        <div>
          <span className="gaming-eyebrow">PERFORMANCE · LOKALES MONITORING</span>
          <h2>Gaming Performance</h2>
          <p>
            {active
              ? `Live-Sitzung: ${active.gameName} · ${formatSessionDuration(active.elapsedSeconds)} · ${active.sampleCount} Messpunkte`
              : 'Starte ein Spiel, um CPU, GPU, Temperaturen und Netzwerk während der Sitzung zu erfassen.'}
          </p>
        </div>
        <div className="gaming-head-actions">
          {active ? (
            <button type="button" className="gaming-button is-danger" onClick={() => void gaming.stop()} disabled={gaming.busy === 'stop'}>
              Sitzung beenden
            </button>
          ) : null}
          <button type="button" className="gaming-button is-ghost" onClick={() => void gaming.refresh()}>
            Aktualisieren
          </button>
        </div>
      </header>

      {active ? (
        <>
          <div className="gaming-live-grid">
            <GamingMetric label="CPU-Auslastung" value={formatMetric(active.live.cpu)} hint="Systemweit" tone="warm" />
            <GamingMetric label="GPU-Auslastung" value={formatMetric(active.live.gpu)} hint="Soweit verfügbar" />
            <GamingMetric label="RAM" value={formatMetric(active.live.ram)} hint="Arbeitsspeicher" />
            <GamingMetric
              label="VRAM"
              value={
                active.live.vramUsed != null && active.live.vramTotal != null
                  ? `${formatBytes(active.live.vramUsed)} / ${formatBytes(active.live.vramTotal)}`
                  : '—'
              }
              hint="Nicht jeder Treiber liefert VRAM"
            />
            <GamingMetric label="CPU-Temperatur" value={formatMetric(active.live.cpuTemp, ' °C')} hint="Höchstwert der Sitzung folgt im Bericht" />
            <GamingMetric label="GPU-Temperatur" value={formatMetric(active.live.gpuTemp, ' °C')} />
            <GamingMetric
              label="Netzwerk"
              value={active.live.down == null ? '—' : `${formatNetwork(active.live.down)} ↓`}
              hint={active.live.up == null ? 'Upload nicht verfügbar' : `${formatNetwork(active.live.up)} ↑`}
            />
            <GamingMetric label="FPS" value="Nicht verfügbar" hint="Ohne Eingriff in das Spiel wird kein FPS-Wert gemessen." tone="muted" />
          </div>

          <div className="gaming-charts">
            <section className="gaming-panel">
              <header>
                <div>
                  <span className="gaming-eyebrow">VERLAUF</span>
                  <h3>CPU &amp; GPU</h3>
                </div>
                <span className="gaming-muted">letzte {timeline.length} Messpunkte</span>
              </header>
              <div className="gaming-chart-legend">
                <span className="is-cpu">CPU</span>
                <span className="is-gpu">GPU</span>
              </div>
              <Sparkline values={timeline.map((sample) => sample.cpu)} color="#f28c28" height={76} />
              <Sparkline values={timeline.map((sample) => sample.gpu)} color="#b87333" height={76} />
              {!timeline.length ? (
                <p className="gaming-muted">
                  Noch keine Messwerte. Die Systemüberwachung benötigt deine Zustimmung und liefert Werte im konfigurierten Intervall.
                </p>
              ) : null}
            </section>
            <section className="gaming-panel">
              <header>
                <div>
                  <span className="gaming-eyebrow">THERMAL</span>
                  <h3>Temperaturen</h3>
                </div>
              </header>
              <Sparkline values={timeline.map((sample) => sample.cpuTemp)} color="#ffb45c" height={76} />
              <Sparkline values={timeline.map((sample) => sample.gpuTemp)} color="#b87333" height={76} />
              <div className="gaming-chart-legend">
                <span className="is-cpu">CPU</span>
                <span className="is-gpu">GPU</span>
              </div>
              <p className="gaming-muted">Nicht verfügbare Sensoren bleiben leer statt geschätzt zu werden.</p>
            </section>
          </div>
        </>
      ) : (
        <GamingEmpty
          title="Keine laufende Spielsitzung"
          text="Sobald ein Spiel über den Hub oder einen erkannten Prozess läuft, erscheinen hier Live-Werte und der Verlauf."
          action={
            snapshot.games[0] ? (
              <button type="button" className="gaming-button is-primary" onClick={() => void gaming.launch(snapshot.games[0].id)}>
                {snapshot.games[0].name} starten
              </button>
            ) : undefined
          }
        />
      )}

      {gaming.report ? (
        <section className="gaming-report-banner">
          <span className="gaming-report-mark">◈</span>
          <div>
            <small>LETZTER SITZUNGSBERICHT</small>
            <strong>{gaming.report.session.gameName}</strong>
            <p>{gaming.report.summary}</p>
          </div>
          <button type="button" className="gaming-button is-ghost is-small" onClick={() => setExpanded(gaming.report!.session.id)}>
            Details
          </button>
        </section>
      ) : null}

      <section className="gaming-panel">
        <header>
          <div>
            <span className="gaming-eyebrow">HISTORIE</span>
            <h3>Sitzungsberichte</h3>
          </div>
          {sessions.length ? (
            <button
              type="button"
              className="gaming-button is-danger is-small"
              onClick={() => {
                if (window.confirm('Gesamte lokale Sitzungshistorie löschen? Das lässt sich nicht rückgängig machen.')) {
                  void gaming.clearSessions();
                }
              }}
            >
              Historie löschen
            </button>
          ) : null}
        </header>
        {!sessions.length ? (
          <p className="gaming-muted">Noch keine Sitzungen gespeichert.</p>
        ) : (
          <div className="gaming-sessions">
            {sessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                expanded={expanded === session.id}
                onToggle={() => setExpanded((current) => (current === session.id ? '' : session.id))}
                onDelete={() => void gaming.deleteSession(session.id)}
              />
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

function SessionRow({
  session,
  expanded,
  onToggle,
  onDelete,
}: {
  session: GamingSession;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <article className={`gaming-session ${expanded ? 'is-open' : ''}`}>
      <button type="button" className="gaming-session-head" onClick={onToggle}>
        <span>
          <strong>{session.gameName}</strong>
          <small>{new Date(session.startedAt).toLocaleString('de-DE')}</small>
        </span>
        <span>{formatSessionDuration(session.durationSeconds)}</span>
        <span>CPU {formatMetric(session.avgCpu)}</span>
        <span>GPU {formatMetric(session.avgGpu)}</span>
        <span className={session.anomalies.length ? 'is-warn' : ''}>{session.anomalies.length ? 'Auffällig' : 'Unauffällig'}</span>
        <span aria-hidden="true">{expanded ? '−' : '+'}</span>
      </button>
      {expanded ? (
        <div className="gaming-session-body">
          <div className="gaming-session-stats">
            <GamingMetric label="CPU Ø" value={formatMetric(session.avgCpu)} />
            <GamingMetric label="GPU Ø" value={formatMetric(session.avgGpu)} />
            <GamingMetric label="RAM Ø" value={formatMetric(session.avgRam)} />
            <GamingMetric label="CPU max." value={formatMetric(session.maxCpuTemp, ' °C')} />
            <GamingMetric label="GPU max." value={formatMetric(session.maxGpuTemp, ' °C')} />
            <GamingMetric label="FPS Ø" value="Nicht verfügbar" tone="muted" />
            <GamingMetric label="Download Ø" value={formatNetwork(session.avgDown)} />
            <GamingMetric label="Upload Ø" value={formatNetwork(session.avgUp)} />
          </div>
          <p>{sessionSummary(session)}</p>
          {session.anomalies.length ? (
            <ul className="gaming-anomalies">
              {session.anomalies.map((entry, index) => (
                <li key={index}>{entry}</li>
              ))}
            </ul>
          ) : (
            <p className="gaming-muted">Keine thermischen oder lastbezogenen Auffälligkeiten überschritten die Schwellwerte.</p>
          )}
          {session.comparison ? (
            <p className="gaming-comparison">
              Vergleich zur vorherigen Sitzung: Dauer{' '}
              {session.comparison.durationDeltaSeconds >= 0 ? '+' : ''}
              {Math.round(session.comparison.durationDeltaSeconds / 60)} Min · CPU{' '}
              {session.comparison.cpuDelta == null ? 'n/a' : `${session.comparison.cpuDelta >= 0 ? '+' : ''}${Math.round(session.comparison.cpuDelta)} %`} ·
              GPU{' '}
              {session.comparison.gpuDelta == null ? 'n/a' : `${session.comparison.gpuDelta >= 0 ? '+' : ''}${Math.round(session.comparison.gpuDelta)} %`}
            </p>
          ) : null}
          <div className="gaming-row-actions">
            <button
              type="button"
              className="gaming-button is-danger is-small"
              onClick={() => {
                if (window.confirm('Diesen Sitzungsbericht löschen?')) onDelete();
              }}
            >
              Bericht löschen
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
