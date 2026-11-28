import { getDesktop, type DiagnoseCheck, type ElevenLabsTestResult } from './desktop';

export interface ClientError {
  at: number;
  level: 'info' | 'warning' | 'error' | 'fatal';
  source: string;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
}

export interface ReportSheet {
  meta: string[];
  checks: DiagnoseCheck[];
  errors: { at: number; level: string; source: string; message: string }[];
  logFile?: string;
  /** null = Desktop-App, Test noch nicht gestartet; undefined = kein Desktop. */
  voiceTest?: ElevenLabsTestResult | null;
}

const recent: ClientError[] = [];
const seen = new Map<string, number>();

/** Fehler der aktuellen Sitzung, neueste zuerst. */
export const localErrors = (): ClientError[] => recent.slice(-25).reverse();

/** Meldet einen Fehler an das Protokoll — im Browser bleibt er im Speicher. */
export function reportClient(input: {
  message: string;
  source?: string;
  level?: ClientError['level'];
  stack?: string;
  context?: Record<string, unknown>;
}): void {
  const at = Date.now();
  const message = String(input.message || 'Unbekannter Fehler').slice(0, 2000);
  const source = input.source || 'Oberfläche';
  const key = `${source}|${message}`;
  const last = seen.get(key) ?? 0;
  if (at - last < 3000) return; // gleiche Meldung nicht im Sekundentakt spammen
  seen.set(key, at);

  const entry: ClientError = {
    at,
    level: input.level ?? 'error',
    source,
    message,
    stack: input.stack?.slice(0, 8000),
    context: input.context,
  };
  recent.push(entry);
  if (recent.length > 50) recent.splice(0, recent.length - 50);

  console.error(`[jarvis] ${entry.level} (${source}): ${message}`, input.stack ?? '');
  const desktop = getDesktop();
  if (desktop?.reportError) {
    void desktop
      .reportError({
        message,
        source,
        level: entry.level === 'fatal' ? 'fatal' : 'error',
        stack: entry.stack,
        context: entry.context,
      })
      .catch(() => undefined);
  }
}

/** Fängt Skriptfehler und abgelehnte Promises der Oberfläche ab. */
export function installErrorHandlers(): void {
  window.addEventListener('error', (event: ErrorEvent) => {
    const target = event.target as unknown as HTMLElement | null;
    const failedResource =
      target && target !== (window as unknown as EventTarget) && !event.error
        ? (target as HTMLImageElement).src || (target as HTMLScriptElement).src || target.tagName
        : '';
    if (failedResource) {
      reportClient({
        source: 'Ressource',
        message: `Ressource konnte nicht geladen werden: ${failedResource}`,
      });
      return;
    }
    reportClient({
      source: 'Fenster',
      message: event.message || event.error?.message || 'Unbekannter Skriptfehler',
      stack: event.error?.stack,
      context: { datei: event.filename, zeile: event.lineno, spalte: event.colno },
    });
  });

  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const reason = event.reason as { message?: string; stack?: string } | string | undefined;
    const message =
      typeof reason === 'string' ? reason : reason?.message || 'Unbehandelte Promise-Ablehnung';
    reportClient({
      source: 'Promise',
      message,
      stack: typeof reason === 'object' ? reason?.stack : undefined,
    });
  });
}

const STATUS_LABEL: Record<DiagnoseCheck['status'], string> = {
  ok: 'OK',
  warn: 'HINWEIS',
  fail: 'FEHLER',
};

/** Baut den Text, der in die Zwischenablage wandert. */
export function formatReport(sheet: ReportSheet): string {
  const lines = ['J.A.R.V.I.S. Fehlerbericht'];
  lines.push(`Erstellt: ${new Date().toLocaleString('de-DE', { hour12: false })}`);
  lines.push(...sheet.meta);
  if (sheet.logFile) lines.push(`Protokoll: ${sheet.logFile}`);
  lines.push(''.padEnd(58, '-'));

  lines.push('', 'Systemprüfung');
  if (sheet.checks.length === 0) {
    lines.push('  keine Prüfungen verfügbar');
  } else {
    for (const check of sheet.checks) {
      lines.push(`  [${STATUS_LABEL[check.status]}] ${check.label}: ${check.detail}`);
      if (check.hint) lines.push(`         → ${check.hint}`);
    }
  }

  if (sheet.voiceTest !== undefined) {
    lines.push('', 'ElevenLabs-Live-Test');
    if (!sheet.voiceTest) {
      lines.push('  noch nicht ausgeführt — im Fehlerprogramm „Key und Stimme jetzt prüfen“ drücken');
    } else {
      const at = new Date(sheet.voiceTest.at).toLocaleString('de-DE', { hour12: false });
      lines.push(`  Zeitpunkt: ${at}`);
      lines.push(`  Stimme: ${sheet.voiceTest.voiceId} · Modell: ${sheet.voiceTest.modelId}`);
      lines.push(`  Ergebnis: ${sheet.voiceTest.summary}`);
      for (const check of sheet.voiceTest.checks) {
        lines.push(`  [${STATUS_LABEL[check.status]}] ${check.label}: ${check.detail}`);
        if (check.hint) lines.push(`         → ${check.hint}`);
      }
    }
  }

  lines.push('', `Fehler (${sheet.errors.length})`);
  if (sheet.errors.length === 0) {
    lines.push('  keine Fehler aufgezeichnet');
  } else {
    for (const error of sheet.errors) {
      const at = new Date(error.at).toLocaleString('de-DE', { hour12: false });
      lines.push(`  [${at}] ${error.level.toUpperCase()} · ${error.source}: ${error.message}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

/** Kopiert Text und meldet ehrlich, wenn der Browser die Zwischenablage sperrt. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
