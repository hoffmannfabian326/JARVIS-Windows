import { useCallback, useEffect, useState } from 'react';
import {
  getDesktop,
  type ActivityEntry,
  type DiagnoseCheck,
  type DiagnoseReport,
  type ElevenLabsTestResult,
} from '../lib/desktop';
import { copyText, formatReport, localErrors, reportClient, type ReportSheet } from '../lib/diagnostics';

interface Props {
  open: boolean;
  onClose: () => void;
  onUndo?: () => void;
  canUndo?: boolean;
}

const STATUS_TEXT: Record<DiagnoseCheck['status'], string> = {
  ok: 'OK',
  warn: 'Hinweis',
  fail: 'Fehler',
};

const numberFormat = new Intl.NumberFormat('de-DE');

/** Notprüfungen, wenn Jarvis im normalen Browser läuft. */
function browserChecks(): DiagnoseCheck[] {
  const checks: DiagnoseCheck[] = [];
  const recognition =
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
  checks.push({
    id: 'speech',
    label: 'Spracherkennung',
    status: recognition ? 'ok' : 'warn',
    detail: recognition ? 'Web-Speech verfügbar' : 'In diesem Browser nicht verfügbar',
    hint: recognition ? undefined : 'Chrome oder Edge nutzen; in der Desktop-App läuft die Erkennung mit.',
  });

  const mic = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
  checks.push({
    id: 'mic',
    label: 'Mikrofonzugriff',
    status: mic ? 'ok' : 'fail',
    detail: mic ? 'Schnittstelle vorhanden' : 'navigator.mediaDevices fehlt',
    hint: mic ? undefined : 'Nur über https oder localhost erlaubt.',
  });

  let storage = false;
  try {
    localStorage.setItem('jarvis.diag', '1');
    localStorage.removeItem('jarvis.diag');
    storage = true;
  } catch {
    storage = false;
  }
  checks.push({
    id: 'storage',
    label: 'Lokaler Speicher',
    status: storage ? 'ok' : 'fail',
    detail: storage ? 'Einstellungen und Notizen bleiben erhalten' : 'localStorage blockiert',
  });

  return checks;
}

export default function DiagnosticsPanel({ open, onClose, onUndo, canUndo }: Props) {
  const desktop = getDesktop();
  const [report, setReport] = useState<DiagnoseReport | null>(null);
  const [checks, setChecks] = useState<DiagnoseCheck[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [voiceTest, setVoiceTest] = useState<ElevenLabsTestResult | null>(null);
  const [testingVoice, setTestingVoice] = useState(false);

  const run = useCallback(async () => {
    setBusy(true);
    setNote('');
    try {
      if (desktop?.diagnose) {
        const result = await desktop.diagnose();
        setReport(result);
        setChecks(result.checks);
        const entries = await desktop.activityList?.(20);
        setActivity(entries ?? []);
      } else {
        setReport(null);
        setChecks(browserChecks());
      }
    } catch (error) {
      reportClient({
        source: 'Fehlerprogramm',
        message: error instanceof Error ? error.message : 'Prüfung fehlgeschlagen',
        stack: error instanceof Error ? error.stack : undefined,
      });
      setChecks([
        {
          id: 'run',
          label: 'Prüfung',
          status: 'fail',
          detail: 'Die Prüfung selbst ist gescheitert — Details im Protokoll.',
        },
      ]);
    } finally {
      setBusy(false);
    }
  }, [desktop]);

  useEffect(() => {
    if (!open) return;
    void run();
  }, [open, run]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const sheet: ReportSheet = {
    meta: report
      ? [
          `${report.version} · ${report.platform} ${report.arch}`,
          `Electron ${report.electron} · Node ${report.node}`,
        ]
      : ['Browser-Vorschau · keine Desktop-Hülle'],
    checks,
    errors: report?.errors?.length ? report.errors : localErrors(),
    logFile: report?.logFile,
    voiceTest: desktop?.testElevenLabs ? voiceTest : undefined,
  };

  const testVoice = async () => {
    if (!desktop?.testElevenLabs) return;
    setTestingVoice(true);
    setNote('');
    try {
      const result = await desktop.testElevenLabs();
      setVoiceTest(result);
      if (!result.ok) setNote('Live-Test nicht bestanden — Hinweise unter den Prüfpunkten.');
    } catch (error) {
      setVoiceTest(null);
      setNote(
        `Live-Test gescheitert: ${error instanceof Error ? error.message : 'unbekannter Fehler'} (Details im Protokoll).`,
      );
    } finally {
      setTestingVoice(false);
    }
  };

  const copy = async () => {
    const ok = await copyText(formatReport(sheet));
    setNote(ok ? 'Bericht kopiert.' : 'Zwischenablage gesperrt.');
  };

  const openFolder = async () => {
    if (!desktop?.openLogFolder) {
      setNote('Das Protokoll gibt es nur in der Desktop-App.');
      return;
    }
    const result = await desktop.openLogFolder();
    setNote(result.ok ? 'Logordner geöffnet.' : result.error || 'Ordner ließ sich nicht öffnen.');
  };

  const problems = checks.filter((check) => check.status !== 'ok').length;
  const errorCount = sheet.errors.length;
  const usage = report?.usage?.elevenlabs;
  const usagePercent = usage
    ? Math.min(100, Math.round((usage.today.characters / Math.max(1, usage.warnCharacters)) * 100))
    : 0;
  const usageDays = usage ? [...usage.days].reverse() : [];
  const llm = report?.usage?.llm;
  const llmPercent = llm
    ? Math.min(100, Math.round((llm.today.tokens / Math.max(1, llm.warnTokens)) * 100))
    : 0;
  const llmDays = llm ? [...llm.days].reverse() : [];

  return (
    <div className={`diagnostics ${open ? 'is-open' : ''}`} aria-hidden={!open}>
      <button type="button" className="diagnostics-backdrop" onClick={onClose} aria-label="Fehlerprogramm schließen" />
      <div className="diagnostics-panel" role="dialog" aria-modal="true" aria-label="Fehlerprogramm">
        <div className="diagnostics-head">
          <div>
            <p className="kicker">Diagnose</p>
            <h2>Fehlerprogramm</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Schließen">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.6" fill="none" />
            </svg>
          </button>
        </div>

        <div className="diag-summary">
          <div className={`diag-badge tone-${problems === 0 ? 'ok' : 'warn'}`}>
            <strong>{problems === 0 ? 'System klar' : `${problems} Auffälligkeit${problems === 1 ? '' : 'en'}`}</strong>
            <span>{checks.length} Prüfungen · {errorCount} Fehler in dieser Sitzung</span>
          </div>
          <button type="button" className="ghost-button diag-again" onClick={() => void run()} disabled={busy}>
            {busy ? 'Prüfe …' : 'Erneut prüfen'}
          </button>
        </div>

        <section className="diag-section">
          <h3>Systemprüfung</h3>
          <ul className="diag-list">
            {checks.map((check) => (
              <li key={check.id} className={`diag-check is-${check.status}`}>
                <span className="diag-status">{STATUS_TEXT[check.status]}</span>
                <div className="diag-body">
                  <strong>{check.label}</strong>
                  <span>{check.detail}</span>
                  {check.hint ? <em>{check.hint}</em> : null}
                </div>
              </li>
            ))}
            {checks.length === 0 ? <li className="diag-empty">Noch keine Prüfung gelaufen.</li> : null}
          </ul>
        </section>

        {usage ? (
          <section className="diag-section">
            <h3>Cloud-Stimme · heute</h3>
            <div className="diag-usage">
              <div>
                <strong>{numberFormat.format(usage.today.characters)}</strong>
                <span>Zeichen</span>
              </div>
              <div>
                <strong>{numberFormat.format(usage.today.requests)}</strong>
                <span>Aufrufe</span>
              </div>
              <div className={usage.today.failures > 0 ? 'is-warn' : ''}>
                <strong>{numberFormat.format(usage.today.failures)}</strong>
                <span>Fehlversuche</span>
              </div>
            </div>

            <div className={`diag-usage-bar ${usage.warning ? 'is-warn' : ''}`} aria-hidden="true">
              <span style={{ width: `${usagePercent}%` }} />
            </div>

            {usage.warning ? (
              <p className="diag-usage-warning">
                Warnschwelle erreicht{usage.reason ? `: ${usage.reason}` : ''}. Cloud-Stimme für Dauerbetrieb
                nicht empfohlen — Piper spricht lokal und ohne Kontingent.
              </p>
            ) : (
              <p className="field-hint">
                Richtwert {numberFormat.format(usage.warnCharacters)} Zeichen pro Tag. ElevenLabs rechnet in
                Zeichen, nicht in Tokens; „Aufrufe“ sind Synthese-Anfragen. Für Dauerbetrieb ist die Cloud-Stimme
                nicht empfohlen.
              </p>
            )}

            {usage.today.lastError ? (
              <p className="field-hint">Letzter Cloud-Fehler: {usage.today.lastError}</p>
            ) : null}

            {usageDays.length > 1 ? (
              <ul className="diag-usage-days">
                {usageDays.map((day) => (
                  <li key={day.date}>
                    <span>
                      {new Date(`${day.date}T12:00:00`).toLocaleDateString('de-DE', {
                        day: '2-digit',
                        month: '2-digit',
                      })}
                    </span>
                    <strong>{numberFormat.format(day.characters)} Zeichen</strong>
                    <em>{numberFormat.format(day.requests)} Aufrufe</em>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        {desktop?.testElevenLabs ? (
          <section className="diag-section">
            <h3>Cloud-Stimme · Live-Test</h3>
            <p className="field-hint">
              Prüft API-Key und Stimmen-ID direkt bei ElevenLabs. Der Test fordert kein Audio an und verbraucht
              deshalb keine Zeichen.
            </p>
            <div className="diag-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => void testVoice()}
                disabled={testingVoice}
              >
                {testingVoice ? 'Prüfe Key und Stimme …' : 'Key und Stimme jetzt prüfen'}
              </button>
            </div>

            {voiceTest ? (
              <>
                <div
                  className={`diag-badge tone-${
                    voiceTest.ok ? 'ok' : voiceTest.checks.some((check) => check.status === 'fail') ? 'fail' : 'warn'
                  }`}
                >
                  <strong>{voiceTest.summary}</strong>
                  <span>
                    Stimme {voiceTest.voiceId} ·{' '}
                    {new Date(voiceTest.at).toLocaleTimeString('de-DE', { hour12: false })}
                  </span>
                </div>
                <ul className="diag-list">
                  {voiceTest.checks.map((check) => (
                    <li key={check.id} className={`diag-check is-${check.status}`}>
                      <span className="diag-status">{STATUS_TEXT[check.status]}</span>
                      <div className="diag-body">
                        <strong>{check.label}</strong>
                        <span>{check.detail}</span>
                        {check.hint ? <em>{check.hint}</em> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>
        ) : null}

        {llm ? (
          <section className="diag-section">
            <h3>Sprachmodell · heute</h3>
            <div className="diag-usage is-four">
              <div>
                <strong>{numberFormat.format(llm.today.tokens)}</strong>
                <span>Tokens</span>
              </div>
              <div>
                <strong>{numberFormat.format(llm.today.requests)}</strong>
                <span>Anfragen</span>
              </div>
              <div className={llm.today.failures > 0 ? 'is-warn' : ''}>
                <strong>{numberFormat.format(llm.today.failures)}</strong>
                <span>Fehler</span>
              </div>
              <div>
                <strong>{llm.priced ? `${llm.today.usd.toFixed(2)} $` : '—'}</strong>
                <span>geschätzt</span>
              </div>
            </div>

            <div className={`diag-usage-bar ${llm.warning ? 'is-warn' : ''}`} aria-hidden="true">
              <span style={{ width: `${llmPercent}%` }} />
            </div>

            {llm.warning ? (
              <p className="diag-usage-warning">
                Warnschwelle erreicht{llm.reason ? `: ${llm.reason}` : ''}. Ein lokales Modell über Ollama kostet
                nichts — Cloud-Modelle rechnen pro Token ab.
              </p>
            ) : (
              <p className="field-hint">
                Richtwert {numberFormat.format(llm.warnTokens)} Tokens pro Tag. Die Kosten sind eine Schätzung aus
                Prompt- und Antwort-Tokens; unbekannte Modelle zählen ohne Preis.
              </p>
            )}

            {llmDays.length > 1 ? (
              <ul className="diag-usage-days">
                {llmDays.map((day) => (
                  <li key={day.date}>
                    <span>
                      {new Date(`${day.date}T12:00:00`).toLocaleDateString('de-DE', {
                        day: '2-digit',
                        month: '2-digit',
                      })}
                    </span>
                    <strong>{numberFormat.format(day.tokens)} Tokens</strong>
                    <em>{day.requests} Anfragen</em>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        <section className="diag-section">
          <h3>Aktivität</h3>
          {activity.length === 0 ? (
            <p className="field-hint">Noch keine Aktionen aufgezeichnet.</p>
          ) : (
            <ul className="activity-list">
              {activity.slice(0, 10).map((entry) => (
                <li key={entry.id} className={entry.ok ? undefined : 'is-fail'}>
                  <span className="activity-time">
                    {new Date(entry.at).toLocaleTimeString('de-DE', { hour12: false })}
                  </span>
                  <strong>{entry.tool}</strong>
                  <span className="activity-text" title={entry.summary}>
                    {entry.summary}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {onUndo && canUndo ? (
            <button type="button" className="ghost-button" onClick={onUndo}>
              Letzte Aktion rückgängig machen
            </button>
          ) : null}
          <p className="field-hint">
            Lokal protokolliert: Werkzeug, gekürzte Argumente, Ergebnis und Zeitpunkt. Keine Keys und keine
            Bildschirmfotos.
          </p>
        </section>

        <section className="diag-section">
          <h3>Letzte Fehler</h3>
          {sheet.errors.length === 0 ? (
            <p className="field-hint">Nichts aufgezeichnet — gut so.</p>
          ) : (
            <ul className="diag-errors">
              {sheet.errors.slice(0, 8).map((error, index) => (
                <li key={`${error.at}-${index}`}>
                  <span className="diag-time">
                    {new Date(error.at).toLocaleTimeString('de-DE', { hour12: false })}
                  </span>
                  <span className={`diag-level is-${error.level}`}>{error.level.toUpperCase()}</span>
                  <span className="diag-error-text" title={error.message}>
                    {error.source}: {error.message}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {report?.logFile ? <p className="field-hint">Protokoll: {report.logFile}</p> : null}
        </section>

        <div className="diag-actions">
          <button type="button" className="ghost-button" onClick={() => void copy()}>
            Bericht kopieren
          </button>
          <button type="button" className="ghost-button" onClick={() => void openFolder()}>
            Logordner öffnen
          </button>
        </div>

        {note ? <p className="crash-note">{note}</p> : null}

        <p className="drawer-foot">
          Alles bleibt lokal. Der Bericht enthält Version, Systemprüfung, Ergebnis des ElevenLabs-Live-Tests und
          Fehlermeldungen — keine API-Keys, keine Gesprächsinhalte.
        </p>
      </div>
    </div>
  );
}
