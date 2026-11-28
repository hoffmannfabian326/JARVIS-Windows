import { useEffect, type ReactNode } from 'react';
import type { GamingGame } from '../../lib/gaming';
import { launcherLabel } from '../../lib/gaming';

export function GameArt({
  game,
  kind = 'cover',
  artwork,
  requestArtwork,
  className = '',
}: {
  game: GamingGame;
  kind?: 'cover' | 'hero';
  artwork: Record<string, string>;
  requestArtwork: (gameId: string, kind: 'cover' | 'hero') => void;
  className?: string;
}) {
  useEffect(() => {
    requestArtwork(game.id, kind);
  }, [game.id, kind, requestArtwork]);

  const source = artwork[`${game.id}:${kind}`];
  const initials = game.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  return (
    <div className={`game-art ${className} ${source ? 'has-image' : ''}`}>
      {source ? (
        <img src={source} alt={`Artwork von ${game.name}`} loading="lazy" draggable={false} />
      ) : (
        <div className="game-art-fallback" aria-hidden="true">
          <span>{initials || '★'}</span>
          <small>{launcherLabel(game.launcher)}</small>
        </div>
      )}
    </div>
  );
}

export function GamingModal({
  title,
  hint,
  children,
  footer,
  onClose,
  wide = false,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div className="gaming-modal-layer" role="presentation">
      <button type="button" className="gaming-modal-backdrop" aria-label="Dialog schließen" onClick={onClose} />
      <section className={`gaming-modal ${wide ? 'is-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <div>
            <span className="gaming-eyebrow">J.A.R.V.I.S. · GAMING</span>
            <h3>{title}</h3>
            {hint ? <p>{hint}</p> : null}
          </div>
          <button type="button" className="gaming-icon-button" onClick={onClose} aria-label="Schließen">
            ×
          </button>
        </header>
        <div className="gaming-modal-body">{children}</div>
        {footer ? <footer>{footer}</footer> : null}
      </section>
    </div>
  );
}

export function GamingToggle({
  checked,
  onChange,
  label,
  hint,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label className={`gaming-toggle ${disabled ? 'is-disabled' : ''}`}>
      <span>
        <strong>{label}</strong>
        {hint ? <small>{hint}</small> : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
      />
      <i aria-hidden="true" />
    </label>
  );
}

export function GamingMetric({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'warm' | 'muted';
}) {
  return (
    <div className={`gaming-metric tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

export function GamingEmpty({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="gaming-empty">
      <span className="gaming-empty-mark" aria-hidden="true">
        ◈
      </span>
      <strong>{title}</strong>
      <p>{text}</p>
      {action}
    </div>
  );
}

export function Sparkline({
  values,
  color = '#f28c28',
  height = 52,
}: {
  values: Array<number | null>;
  color?: string;
  height?: number;
}) {
  const usable = values.map((value, index) => ({ value, index })).filter((entry) => entry.value != null) as Array<{
    value: number;
    index: number;
  }>;
  if (usable.length < 2) {
    return <div className="gaming-spark is-empty">Noch zu wenig Messwerte</div>;
  }
  const max = Math.max(...usable.map((entry) => entry.value), 1);
  const min = Math.min(...usable.map((entry) => entry.value), 0);
  const span = Math.max(1, max - min);
  const width = 240;
  const points = usable
    .map((entry) => {
      const x = (entry.index / Math.max(1, values.length - 1)) * width;
      const y = height - ((entry.value - min) / span) * (height - 6) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg
      className="gaming-spark"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ height: `${height}px` }}
      aria-hidden="true"
    >
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
