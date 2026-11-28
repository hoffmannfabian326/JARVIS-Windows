import type { TelemetryState } from '../hooks/useTelemetry';
import type { TelemetrySample } from '../lib/desktop';

interface Props {
  telemetry: TelemetryState;
}

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return <svg className="spark" viewBox="0 0 100 30" aria-hidden="true" />;
  const step = 100 / (values.length - 1);
  const points = values
    .map((value, index) => `${(index * step).toFixed(1)},${(28 - Math.min(100, Math.max(0, value)) * 0.26).toFixed(1)}`)
    .join(' ');
  return (
    <svg className="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

function gb(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1).replace('.', ',')} TB`;
  return `${(bytes / 1e9).toFixed(1).replace('.', ',')} GB`;
}

function mbit(bytesPerSecond: number): string {
  const mbitValue = (bytesPerSecond * 8) / 1e6;
  return `${mbitValue.toFixed(mbitValue >= 100 ? 0 : 1).replace('.', ',')} Mbit/s`;
}

function Metric({
  icon,
  name,
  load,
  temp,
  meta,
  values,
  display,
  showTemp = true,
}: {
  icon: string;
  name: string;
  load: number | null;
  temp: number | null;
  meta: string;
  values: number[];
  display?: string;
  showTemp?: boolean;
}) {
  const width = load == null ? 0 : Math.min(100, Math.max(0, load));
  return (
    <div className="metric">
      <span className="metric-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d={icon} fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      </span>
      <div className="metric-body">
        <div className="metric-top">
          <span className="metric-name">{name}</span>
          <span className="metric-value">{display ?? (load == null ? '—' : `${load} %`)}</span>
        </div>
        <div className="metric-bar">
          <span style={{ width: `${width}%` }} />
        </div>
        <div className="metric-meta">
          {showTemp ? (
            <span className="metric-temp">{temp == null ? 'Temp n/a' : `${temp} °C`}</span>
          ) : null}
          <span>{meta}</span>
        </div>
      </div>
      <Spark values={values} />
    </div>
  );
}

function Body({ telemetry, sample }: { telemetry: TelemetryState; sample: TelemetrySample }) {
  return (
    <>
      <Metric
        icon="M7 7h10v10H7zM9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4"
        name="CPU"
        load={sample.cpu.load}
        temp={sample.cpu.temp}
        meta={sample.cpu.cores ? `${sample.cpu.cores} Kerne` : 'Kerne n/a'}
        values={telemetry.history.cpu}
      />
      <Metric
        icon="M3 8l9-4 9 4-9 4zM3 12l9 4 9-4M3 16l9 4 9-4"
        name="GPU"
        load={sample.gpu.load}
        temp={sample.gpu.temp}
        meta={sample.gpu.name ? sample.gpu.name.replace(/\(R\)|\(TM\)/g, '').trim().slice(0, 26) : 'nicht erkannt'}
        values={telemetry.history.gpu}
      />
      <Metric
        icon="M6 4h12v16H6zM9 8h6M9 12h6M9 16h3"
        name="RAM"
        load={sample.mem?.percent ?? null}
        temp={null}
                  meta={sample.mem ? `${gb(sample.mem.used)} / ${gb(sample.mem.total)}` : 'n/a'}
          values={telemetry.history.mem}
          showTemp={false}
        />
      {sample.disk ? (
        <Metric
          icon="M4 6h16v5H4zM4 13h16v5H4zM7 8.5h.1M7 15.5h.1"
          name="Speicher"
          load={sample.disk.percent}
          temp={null}
          meta={`${gb(sample.disk.used)} / ${gb(sample.disk.size)}`}
          values={[]}
          showTemp={false}
        />
      ) : null}
      {sample.net ? (
        <Metric
          icon="M3 9a13 13 0 0 1 18 0M6.5 12.5a8 8 0 0 1 11 0M10 16a3 3 0 0 1 4 0M12 19h.1"
          name="Netzwerk"
          load={null}
          temp={null}
          meta={`↑ ${mbit(sample.net.up)}`}
          values={[]}
          display={`${mbit(sample.net.down)} ↓`}
          showTemp={false}
        />
      ) : null}
    </>
  );
}

export default function Telemetry({ telemetry }: Props) {
  const { consent, sample, supported } = telemetry;

  return (
    <aside className="panel telemetry" aria-label="Systemtelemetrie">
      <div className="panel-head">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M2 12h4l2-6 3 12 3-9 2 3h6" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        <h2>System Telemetrie</h2>
      </div>

      {!supported ? (
        <p className="tele-empty">Telemetrie ist nur in der Desktop-App verfügbar.</p>
      ) : consent === false ? (
        <div className="tele-empty">
          <p>Systemzugriff nicht freigegeben.</p>
          <button type="button" className="tele-enable" onClick={() => void telemetry.grant()}>
            Jetzt erlauben
          </button>
        </div>
      ) : consent === null || !sample ? (
        <p className="tele-empty">Werte werden geladen …</p>
      ) : (
        <div className="tele-body">
          <Body telemetry={telemetry} sample={sample} />
        </div>
      )}

      <p className="tele-foot">Lokal gelesen · keine Übertragung</p>
    </aside>
  );
}
