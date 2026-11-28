import type { CSSProperties } from 'react';

/**
 * Instrumente nach dem HUD-Concept: kreisrunde Skalen, Segmentkränze,
 * Pegel-Säulen und getaperte Balken. Reine Anzeige, keine Datenquelle.
 */

const CX = 60;
const CY = 60;
const START = 136;
const SWEEP = 268;
const SEGMENTS = 40;
const TICKS = 45;

function polar(radius: number, degrees: number) {
  const rad = (degrees * Math.PI) / 180;
  return { x: CX + radius * Math.cos(rad), y: CY + radius * Math.sin(rad) };
}

function arcPath(radius: number, from: number, to: number) {
  const start = polar(radius, from);
  const end = polar(radius, to);
  const large = Math.abs(to - from) > 180 ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${large} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

function ratioOf(value: number | null): number {
  if (value == null || Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value / 100));
}

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="gauge-spark" aria-hidden="true" />;
  const step = 100 / (values.length - 1);
  const points = values
    .map((value, index) => `${(index * step).toFixed(1)},${(24 - Math.min(100, Math.max(0, value)) * 0.22).toFixed(1)}`)
    .join(' ');
  return (
    <svg className="gauge-spark" viewBox="0 0 100 26" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

interface GaugeProps {
  label: string;
  value: number | null;
  display?: string;
  meta?: string;
  spark?: number[];
  tone?: 'ok' | 'warn';
}

export function RingGauge({ label, value, display, meta, spark, tone = 'ok' }: GaugeProps) {
  const ratio = ratioOf(value);
  const step = SWEEP / SEGMENTS;

  const ticks = Array.from({ length: TICKS }, (_, index) => {
    const major = index % 5 === 0;
    const angle = START + (SWEEP / (TICKS - 1)) * index;
    const outer = polar(54, angle);
    const inner = polar(major ? 47 : 50, angle);
    return (
      <line
        key={index}
        className={major ? 'gauge-tick is-major' : 'gauge-tick'}
        x1={inner.x.toFixed(2)}
        y1={inner.y.toFixed(2)}
        x2={outer.x.toFixed(2)}
        y2={outer.y.toFixed(2)}
      />
    );
  });

  const segments = Array.from({ length: SEGMENTS }, (_, index) => {
    const from = START + step * index + 1.3;
    const to = from + step - 2.6;
    const lit = ratio > 0 && index + 1 <= Math.ceil(ratio * SEGMENTS);
    return (
      <path
        key={index}
        d={arcPath(42, from, to)}
        className={lit ? 'gauge-seg is-lit' : 'gauge-seg'}
        style={{ '--seg-index': index } as CSSProperties}
      />
    );
  });

  return (
    <div className={`gauge ${tone === 'warn' ? 'is-warn' : ''}`}>
      <div className="gauge-shell">
        <svg viewBox="0 0 120 120" className="gauge-svg" aria-hidden="true">
          <circle className="gauge-orbit" cx={CX} cy={CY} r={51} />
          {ticks}
          <g className="gauge-arcs">{segments}</g>
          <circle className="gauge-dots" cx={CX} cy={CY} r={32} />
          <circle className="gauge-hub" cx={CX} cy={CY} r={21} />
        </svg>
        <div className="gauge-read">
          <strong>{display ?? (value == null ? '—' : `${Math.round(value)}`)}</strong>
          <span>{label}</span>
        </div>
      </div>
      <Spark values={spark ?? []} />
      {meta ? <p className="gauge-meta">{meta}</p> : null}
    </div>
  );
}

interface LevelProps {
  label: string;
  value: number | null;
  display?: string;
  meta?: string;
}

const LEVEL_STEPS = 22;

export function LevelColumn({ label, value, display, meta }: LevelProps) {
  const ratio = ratioOf(value);
  const lit = Math.round(ratio * LEVEL_STEPS);

  return (
    <div className="level">
      <div className="level-track" aria-hidden="true">
        {Array.from({ length: LEVEL_STEPS }, (_, index) => (
          <i
            key={index}
            className={index < lit ? 'is-lit' : ''}
            style={{ animationDelay: `${index * 45}ms` }}
          />
        ))}
        <span className="level-glide" style={{ bottom: `${Math.min(96, ratio * 100)}%` }} />
      </div>
      <div className="level-read">
        <strong>{display ?? (value == null ? '—' : `${Math.round(value)} %`)}</strong>
        <span>{label}</span>
        {meta ? <em>{meta}</em> : null}
      </div>
    </div>
  );
}

interface BarProps {
  label: string;
  value?: number | null;
  display?: string;
  meta?: string;
  steps?: number;
  stream?: boolean;
}

export function BarCluster({ label, value = null, display, meta, steps = 30, stream = false }: BarProps) {
  const ratio = ratioOf(value);
  const lit = value == null ? 0 : Math.round(ratio * steps);

  return (
    <div className={`bars ${stream ? 'is-stream' : ''}`}>
      <div className="bars-head">
        <span>{label}</span>
        <strong>{display ?? (value == null ? '—' : `${Math.round(value)} %`)}</strong>
      </div>
      <div className="bars-track" aria-hidden="true">
        {Array.from({ length: steps }, (_, index) => (
          <i
            key={index}
            className={index < lit ? 'is-lit' : ''}
            style={{ animationDelay: `${(index % 12) * 70}ms` }}
          />
        ))}
      </div>
      {meta ? <p className="bars-meta">{meta}</p> : null}
    </div>
  );
}

interface TrendProps {
  label: string;
  series: Array<{ name: string; values: number[] }>;
}

function trendPoints(values: number[]): string {
  const slice = values.slice(-28);
  if (slice.length < 2) return '';
  return slice
    .map((value, index) => {
      const x = (index / (slice.length - 1)) * 100;
      const y = 100 - Math.min(100, Math.max(0, value));
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

/** Verlaufsdiagramm mit Gitter, Achsenwerten und laufendem Abtaststrich. */
export function TrendChart({ label, series }: TrendProps) {
  return (
    <div className="trend">
      <div className="trend-head">
        <span>{label}</span>
        <span className="trend-legend">
          {series.map((entry, index) => (
            <em key={entry.name} className={`trend-key trend-key-${index}`}>
              {entry.name}
            </em>
          ))}
        </span>
      </div>
      <div className="trend-plot">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <g className="trend-grid">
            {[20, 40, 60, 80].map((y) => (
              <line key={y} x1="0" y1={y} x2="100" y2={y} />
            ))}
            {[20, 40, 60, 80].map((x) => (
              <line key={`v${x}`} x1={x} y1="0" x2={x} y2="100" />
            ))}
          </g>
          {series.map((entry, index) => {
            const points = trendPoints(entry.values);
            return points ? (
              <polyline key={entry.name} className={`trend-line trend-line-${index}`} points={points} />
            ) : null;
          })}
        </svg>
        <span className="trend-scan" />
        <span className="trend-axis">
          <em>100</em>
          <em>50</em>
          <em>0</em>
        </span>
      </div>
      <div className="trend-foot">
        {series.map((entry) => (
          <span key={entry.name}>
            {entry.name} · {entry.values.length ? `${Math.round(entry.values[entry.values.length - 1])} %` : '—'}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ScopeSweep({ label = 'SCAN', tone = 'ok' }: { label?: string; tone?: 'ok' | 'warn' }) {
  return (
    <div className={`scope ${tone === 'warn' ? 'is-warn' : ''}`} aria-hidden="true">
      <span className="scope-ring" />
      <span className="scope-ring scope-ring-inner" />
      <span className="scope-grid" />
      <span className="scope-beam" />
      <span className="scope-blip" />
      <span className="scope-core" />
      <span className="scope-label">{label}</span>
    </div>
  );
}
