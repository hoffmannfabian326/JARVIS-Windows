interface Props {
  notes: number;
  timers: number;
  city: string;
  onRun: (text: string) => void;
  onVoice: () => void;
  onSettings: () => void;
}

const ICONS = {
  knowledge: 'M4 6h6a2 2 0 0 1 2 2v11a2 2 0 0 0-2-2H4zM20 6h-6a2 2 0 0 0-2 2v11a2 2 0 0 1 2-2h6z',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3.5 2',
  weather: 'M7 17a4 4 0 0 1 .5-8 5.5 5.5 0 0 1 10.4 2A3.5 3.5 0 0 1 17.5 17z',
  screen: 'M3 5h18v11H3zM8 20h8M12 16v4',
  voice: 'M4 12h2M8 8v8M12 5v14M16 9v6M20 11v2',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 13.5a7 7 0 0 0 0-3l2-1.4-2-3.5-2.2.9a7 7 0 0 0-2.6-1.5L14 2h-4l-.3 2.1A7 7 0 0 0 7.2 5.6L5 4.7 3 8.1l2 1.4a7 7 0 0 0 0 3L3 14l2 3.4 2.2-.9a7 7 0 0 0 2.5 1.5L10 20h4l.3-2.1a7 7 0 0 0 2.6-1.5l2.1.9 2-3.4z',
};

function Tile({
  icon,
  title,
  subtitle,
  badge,
  onClick,
}: {
  icon: string;
  title: string;
  subtitle: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="tile" onClick={onClick}>
      {badge ? <span className="tile-badge">{badge}</span> : null}
      <svg viewBox="0 0 24 24" aria-hidden="true" className="tile-icon">
        <path d={icon} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <strong>{title}</strong>
      <span>{subtitle}</span>
    </button>
  );
}

export default function Tiles({ notes, timers, city, onRun, onVoice, onSettings }: Props) {
  return (
    <section className="tiles" aria-label="Module">
      <Tile
        icon={ICONS.knowledge}
        title="Wissen"
        subtitle="Notizen · Gedächtnis"
        badge={notes > 0 ? String(notes) : undefined}
        onClick={() => onRun('meine Notizen')}
      />
      <Tile
        icon={ICONS.clock}
        title="Timer"
        subtitle="Erinnerungen · Wecker"
        badge={timers > 0 ? String(timers) : undefined}
        onClick={() => onRun('Timer für 5 Minuten')}
      />
      <Tile
        icon={ICONS.weather}
        title="Umgebung"
        subtitle={`Wetter · ${city}`}
        onClick={() => onRun(`Wetter in ${city}`)}
      />
      <Tile
        icon={ICONS.screen}
        title="Bildschirm"
        subtitle="Sehen · Zusammenfassen"
        onClick={() => onRun('Was steht auf dem Bildschirm?')}
      />
      <Tile icon={ICONS.voice} title="Voice" subtitle="Sprachsteuerung · Stimme" onClick={onVoice} />
      <Tile icon={ICONS.settings} title="Einstellungen" subtitle="Anbieter · Sensoren" onClick={onSettings} />
    </section>
  );
}
