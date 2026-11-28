import { useEffect, useState } from 'react';

const CHECKS: Array<[string, string]> = [
  ['Kernreaktor', 'stabil'],
  ['Sprachmodul', 'geladen'],
  ['Mikrofon-Array', 'kalibriert'],
  ['Weckwort', 'aktiv'],
  ['Voice Link', 'verbunden'],
];

export default function BootOverlay({ onDone }: { onDone: () => void }) {
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const fade = window.setTimeout(() => setClosing(true), 2000);
    const done = window.setTimeout(onDone, 2500);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(done);
    };
  }, [onDone]);

  return (
    <div className={`boot ${closing ? 'is-closing' : ''}`} onClick={onDone} role="presentation">
      <div className="boot-inner">
        <p className="boot-tag">Stark Industries · Interface Protokoll</p>
        <h1 className="boot-title">J.A.R.V.I.S.</h1>
        <p className="boot-sub">Just A Rather Very Intelligent System</p>

        <ul className="boot-checks">
          {CHECKS.map(([label, value], index) => (
            <li key={label} style={{ animationDelay: `${240 + index * 240}ms` }}>
              <span>{label}</span>
              <span className="boot-value">
                {value}
                <i>ok</i>
              </span>
            </li>
          ))}
        </ul>

        <div className="boot-bar">
          <span />
        </div>
        <p className="boot-foot">Klicken zum Überspringen</p>
      </div>
    </div>
  );
}
