import type { TelemetryState } from '../hooks/useTelemetry';
import type { TelemetrySample } from '../lib/desktop';
import { BarCluster, LevelColumn, RingGauge, TrendChart } from './HudInstruments';

interface Props {
  telemetry: TelemetryState;
}

function gb(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1).replace('.', ',')} TB`;
  return `${(bytes / 1e9).toFixed(1).replace('.', ',')} GB`;
}

function mbit(bytesPerSecond: number): string {
  const mbitValue = (bytesPerSecond * 8) / 1e6;
  return `${mbitValue.toFixed(mbitValue >= 100 ? 0 : 1).replace('.', ',')} Mbit/s`;
}

function tempText(value: number | null | undefined): string {
  return value == null ? 'Temp n/a' : `${value} °C`;
}

function Body({ telemetry, sample }: { telemetry: TelemetryState; sample: TelemetrySample }) {
  const mem = sample.mem;
  const disk = sample.disk;
  const net = sample.net;

  return (
    <div className="tele-instruments">
      <div className="tele-dials">
        <RingGauge
          label="CPU"
          value={sample.cpu.load}
          display={sample.cpu.load == null ? '—' : `${sample.cpu.load} %`}
          spark={telemetry.history.cpu}
          meta={`${tempText(sample.cpu.temp)} · ${sample.cpu.cores ? `${sample.cpu.cores} Kerne` : 'Kerne n/a'}`}
        />
        <RingGauge
          label="GPU"
          value={sample.gpu.load}
          display={sample.gpu.load == null ? '—' : `${sample.gpu.load} %`}
          spark={telemetry.history.gpu}
          meta={
            sample.gpu.name
              ? `${tempText(sample.gpu.temp)} · ${sample.gpu.name.replace(/\(R\)|\(TM\)/g, '').trim().slice(0, 24)}`
              : tempText(sample.gpu.temp)
          }
        />
      </div>

      <div className="tele-levels">
        <LevelColumn
          label="Arbeitsspeicher"
          value={mem?.percent ?? null}
          display={mem ? `${Math.round(mem.percent)} %` : '—'}
          meta={mem ? `${gb(mem.used)} / ${gb(mem.total)}` : 'n/a'}
        />
        <LevelColumn
          label="Datenträger"
          value={disk?.percent ?? null}
          display={disk ? `${Math.round(disk.percent)} %` : '—'}
          meta={disk ? `${gb(disk.used)} / ${gb(disk.size)}` : 'n/a'}
        />
      </div>

      <TrendChart
        label="Verlauf"
        series={[
          { name: 'CPU', values: telemetry.history.cpu },
          { name: 'GPU', values: telemetry.history.gpu },
        ]}
      />

      {net ? (
        <BarCluster
          stream
          label="Netzwerk"
          display={`${mbit(net.down)} ↓`}
          meta={`↑ ${mbit(net.up)}`}
          steps={28}
        />
      ) : null}
    </div>
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
        <span className="panel-tag">live</span>
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
