interface Props {
  open: boolean;
  onAllow: () => void;
  onDeny: () => void;
}

export default function FirstRunGate({ open, onAllow, onDeny }: Props) {
  if (!open) return null;

  return (
    <div className="gate" role="dialog" aria-modal="true" aria-label="Systemzugriff erlauben">
      <div className="gate-card">
        <p className="gate-kicker">Ersteinrichtung</p>
        <h2>Systemzugriff erlauben?</h2>
        <p className="gate-copy">
          Für die Telemetrie liest J.A.R.V.I.S. lokal CPU- und GPU-Auslastung, Temperaturen und den
          Arbeitsspeicher. Alles bleibt auf diesem Rechner — es wird nichts gesendet oder gespeichert.
        </p>
        <ul className="gate-list">
          <li>
            <span>CPU</span> Auslastung &amp; Temperatur
          </li>
          <li>
            <span>GPU</span> Auslastung &amp; Temperatur
          </li>
          <li>
            <span>RAM</span> Belegung
          </li>
        </ul>
        <p className="gate-hint">
          Temperaturen sind nicht auf jeder Hardware verfügbar; dann zeigt das HUD „n/a“. Das Mikrofon
          fragt das Betriebssystem separat beim ersten Zuhören.
        </p>
        <div className="gate-actions">
          <button type="button" className="gate-deny" onClick={onDeny}>
            Ohne Telemetrie
          </button>
          <button type="button" className="gate-allow" onClick={onAllow}>
            Zugriff erlauben
          </button>
        </div>
      </div>
    </div>
  );
}
