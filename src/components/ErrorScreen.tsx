import { Component, type ErrorInfo, type ReactNode } from 'react';
import { getDesktop } from '../lib/desktop';
import { copyText, localErrors, reportClient } from '../lib/diagnostics';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  componentStack: string;
  note: string;
}

/**
 * Letzte Verteidigungslinie der Oberfläche: zeigt statt eines weißen Fensters
 * eine lesbare Störungsmeldung mit Kopier-, Protokoll- und Neustartknopf.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: '', note: '' };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error, note: '' };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ componentStack: info.componentStack ?? '' });
    reportClient({
      level: 'fatal',
      source: 'Oberfläche · Baustein',
      message: error.message || error.name,
      stack: `${error.stack ?? ''}\n${info.componentStack ?? ''}`,
    });
  }

  private retry = (): void => {
    this.setState({ error: null, componentStack: '', note: '' });
  };

  private copyReport = async (): Promise<void> => {
    const error = this.state.error;
    const text = [
      'J.A.R.V.I.S. — Absturzbericht der Oberfläche',
      `Zeitpunkt: ${new Date().toLocaleString('de-DE', { hour12: false })}`,
      `Meldung: ${error?.message ?? 'unbekannt'}`,
      '',
      error?.stack ?? '',
      this.state.componentStack,
    ].join('\n');
    const ok = await copyText(text);
    this.setState({ note: ok ? 'Bericht kopiert.' : 'Zwischenablage gesperrt — nutze „Protokoll öffnen“.' });
  };

  private openLog = async (): Promise<void> => {
    const desktop = getDesktop();
    if (!desktop?.openLogFolder) {
      this.setState({ note: 'Das Protokoll gibt es nur in der Desktop-App.' });
      return;
    }
    const result = await desktop.openLogFolder();
    if (!result.ok) this.setState({ note: result.error || 'Ordner ließ sich nicht öffnen.' });
  };

  private reload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const errors = localErrors();

    return (
      <div className="crash" role="alert">
        <div className="crash-scan" aria-hidden="true" />
        <div className="crash-panel">
          <p className="kicker">Systemstörung</p>
          <h1>Ein Baustein ist ausgefallen</h1>
          <p className="crash-text">
            J.A.R.V.I.S. hat den Fehler abgefangen, damit das Fenster nicht leer bleibt. Der Rest des Systems
            arbeitet weiter — ein Neustart der Oberfläche genügt meist.
          </p>

          <div className="crash-error">
            <span className="crash-error-label">{error.name || 'Error'}</span>
            <code>{error.message || 'Unbekannter Fehler'}</code>
          </div>

          <div className="crash-meta">
            <div className="kv">
              <span className="kv-label">Sitzungsfehler</span>
              <span className="kv-value tone-warn">{errors.length}</span>
            </div>
            <div className="kv">
              <span className="kv-label">Protokoll</span>
              <span className="kv-value kv-value--wrap tone-off">logs/fehler.log</span>
            </div>
          </div>

          <details className="crash-details">
            <summary>Technische Details</summary>
            <pre>{`${error.stack ?? 'kein Stack'}\n${this.state.componentStack}`.trim()}</pre>
          </details>

          <div className="crash-actions">
            <button type="button" className="ghost-button" onClick={this.retry}>
              Erneut versuchen
            </button>
            <button type="button" className="ghost-button" onClick={() => void this.copyReport()}>
              Bericht kopieren
            </button>
            <button type="button" className="ghost-button" onClick={() => void this.openLog()}>
              Protokoll öffnen
            </button>
            <button type="button" className="ghost-button ghost-danger" onClick={this.reload}>
              Oberfläche neu laden
            </button>
          </div>

          {this.state.note ? <p className="crash-note">{this.state.note}</p> : null}

          <p className="crash-foot">
            Fehler werden lokal protokolliert, nicht gesendet. Tritt das wiederholt auf, hilft der Bericht beim
            Eingrenzen.
          </p>
        </div>
      </div>
    );
  }
}
