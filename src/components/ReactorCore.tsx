import { useEffect, useRef } from 'react';
import type { Mode } from '../types';

interface Props {
  mode: Mode;
  analyser: AnalyserNode | null;
  onActivate: () => void;
}

const ACCENT: Record<Mode, string> = {
  off: '#8a4a12',
  wake: '#ff8a1f',
  woken: '#ffb347',
  thinking: '#ffd79a',
  speaking: '#fff0c9',
};

const TAU = Math.PI * 2;

function rgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const value = parseInt(clean, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Der Reaktorkern nach dem HUD-Concept: Mikrometer-Ticks, ein Kranz aus
 * ungleich langen Segmenten, Kupfer-Punktring, Radar-Sweep, Wellenform und
 * eine rotierende Drahtgitter-Kugel in der Mitte.
 */
export default function ReactorCore({ mode, analyser, onActivate }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const phaseRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const wave = new Uint8Array(256).fill(128);
    let level = 0;
    let previous = performance.now();
    let frame = 0;

    const draw = (timestamp: number) => {
      const delta = Math.min(0.06, (timestamp - previous) / 1000);
      previous = timestamp;
      phaseRef.current += delta * (mode === 'thinking' ? 1.1 : mode === 'speaking' ? 0.55 : 0.24);

      const accent = ACCENT[mode];
      const cx = width / 2;
      const cy = height / 2;
      const R = Math.min(width, height) * 0.335;
      const phase = phaseRef.current;

      if (analyser) {
        analyser.getByteTimeDomainData(wave);
        let sum = 0;
        for (let i = 0; i < wave.length; i += 1) {
          const v = (wave[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / wave.length);
        const target = Math.min(1, rms * 3.4);
        level += (target - level) * 0.18;
      } else {
        level += (0 - level) * 0.08;
      }

      ctx.clearRect(0, 0, width, height);

      // Halo hinter dem gesamten Instrument
      const halo = ctx.createRadialGradient(cx, cy, R * 0.05, cx, cy, R * 1.75);
      halo.addColorStop(0, rgba(accent, 0.18 + level * 0.16));
      halo.addColorStop(0.45, rgba(accent, 0.05));
      halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.75, 0, TAU);
      ctx.fill();

      // Mikrometer-Ticks am äußeren Rand
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(phase * 0.07);
      for (let i = 0; i < 96; i += 1) {
        const angle = (i / 96) * TAU;
        const major = i % 8 === 0;
        const mid = i % 4 === 0;
        const outer = R * 1.46;
        const inner = R * (major ? 1.36 : mid ? 1.39 : 1.41);
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
        ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
        ctx.lineWidth = major ? 1.4 : 0.55;
        ctx.strokeStyle = rgba(accent, major ? 0.6 : mid ? 0.34 : 0.2);
        ctx.stroke();
      }
      ctx.restore();

      // Segmentkranz aus ungleich langen Blöcken
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-phase * 0.15);
      const blocks = 56;
      for (let i = 0; i < blocks; i += 1) {
        const angle = (i / blocks) * TAU;
        const span = 0.05 + (Math.sin(i * 1.7) + 1) * 0.022;
        const inner = R * 1.19;
        const outer = R * (1.26 + (Math.sin(i * 0.9 + phase * 0.5) + 1) * 0.035 + level * 0.05);
        ctx.beginPath();
        ctx.arc(0, 0, outer, angle, angle + span);
        ctx.arc(0, 0, inner, angle + span, angle, true);
        ctx.closePath();
        ctx.fillStyle = rgba(accent, 0.16 + (Math.sin(i * 0.6 - phase * 1.3) + 1) * 0.14);
        ctx.fill();
      }
      ctx.restore();

      // Gestrichelter Orbit
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-phase * 0.26);
      ctx.setLineDash([2, 10]);
      ctx.strokeStyle = rgba(accent, 0.46);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, R * 1.1, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Radar-Sweep
      ctx.save();
      ctx.translate(cx, cy);
      const createConic = (ctx as any).createConicGradient;
      if (typeof createConic === 'function') {
        const sweep = createConic.call(ctx, -phase * 1.3, 0, 0);
        sweep.addColorStop(0, rgba(accent, 0));
        sweep.addColorStop(0.1, rgba(accent, 0.14 + level * 0.12));
        sweep.addColorStop(0.17, rgba(accent, 0));
        sweep.addColorStop(1, rgba(accent, 0));
        ctx.fillStyle = sweep;
        ctx.beginPath();
        ctx.arc(0, 0, R * 1.05, 0, TAU);
        ctx.fill();

        const beam = ctx.createLinearGradient(0, 0, 0, -R * 1.05);
        beam.addColorStop(0, rgba(accent, 0.5));
        beam.addColorStop(1, rgba(accent, 0));
        ctx.strokeStyle = beam;
        ctx.lineWidth = 1;
        ctx.save();
        ctx.rotate(phase * 1.3);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -R * 1.05);
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();

      // Kupfer-Punktring (Gegenspieler zum Segmentkranz)
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(phase * 0.18);
      ctx.setLineDash([1, 6]);
      ctx.strokeStyle = 'rgba(224, 138, 60, 0.65)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.78, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Wellenform-Ring
      ctx.save();
      ctx.translate(cx, cy);
      ctx.beginPath();
      const points = 200;
      for (let i = 0; i <= points; i += 1) {
        const sample = wave[Math.floor((i / points) * (wave.length - 1))] ?? 128;
        const v = (sample - 128) / 128;
        const angle = (i / points) * TAU - Math.PI / 2;
        const radius = R * 0.93 - v * R * 0.16 * (0.5 + level * 1.8);
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = rgba(accent, 0.85);
      ctx.lineWidth = 1.3;
      ctx.shadowColor = rgba(accent, 0.8);
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();

      // Drahtgitter-Kugel: Längengrade, Breitengrade, Knoten
      ctx.save();
      ctx.translate(cx, cy);
      const pulse = 1 + Math.sin(phase * 2.1) * 0.02 + level * 0.24;
      const coreR = R * 0.5 * pulse;

      const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR * 1.15);
      glow.addColorStop(0, rgba('#fff6e6', 0.5));
      glow.addColorStop(0.3, rgba(accent, 0.34));
      glow.addColorStop(1, rgba(accent, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, coreR * 1.15, 0, TAU);
      ctx.fill();

      ctx.strokeStyle = rgba(accent, 0.32);
      ctx.lineWidth = 0.8;

      for (let i = 1; i < 5; i += 1) {
        const y = -coreR + (i / 5) * coreR * 2;
        const rx = Math.sqrt(Math.max(0, coreR * coreR - y * y));
        ctx.beginPath();
        ctx.ellipse(0, y, rx, rx * 0.18, 0, 0, TAU);
        ctx.stroke();
      }

      for (let i = 0; i < 3; i += 1) {
        const spin = phase * 0.3 + (i * Math.PI) / 3;
        const rx = Math.abs(Math.cos(spin)) * coreR;
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, coreR, 0, 0, TAU);
        ctx.stroke();
      }

      ctx.fillStyle = rgba('#fff1d8', 0.75);
      for (let i = 0; i < 10; i += 1) {
        const angle = phase * 0.5 + (i / 10) * TAU;
        const latitude = Math.sin(i * 1.3 + phase * 0.4) * coreR * 0.7;
        const radius = Math.sqrt(Math.max(0, coreR * coreR - latitude * latitude));
        const x = Math.cos(angle) * radius;
        const y = latitude;
        ctx.beginPath();
        ctx.arc(x, y, i % 3 === 0 ? 1.5 : 0.9, 0, TAU);
        ctx.fill();
      }

      ctx.strokeStyle = rgba(accent, 0.45);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, coreR, 0, TAU);
      ctx.stroke();
      ctx.restore();

      // Fadenkreuz und umlaufende Satelliten
      ctx.save();
      ctx.translate(cx, cy);
      ctx.strokeStyle = rgba(accent, 0.42);
      for (let i = 0; i < 4; i += 1) {
        ctx.save();
        ctx.rotate((i / 4) * TAU + phase * 0.2);
        ctx.beginPath();
        ctx.moveTo(R * 0.54, 0);
        ctx.lineTo(R * 0.62, 0);
        ctx.stroke();
        ctx.restore();
      }

      for (let i = 0; i < 3; i += 1) {
        const angle = phase * (0.5 + i * 0.17) + (i / 3) * TAU;
        const radius = R * (1.13 + i * 0.035);
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        ctx.fillStyle = rgba(accent, 0.85);
        ctx.shadowColor = rgba(accent, 0.9);
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(x, y, 1.8, 0, TAU);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.restore();

      // Umlaufende Beschriftung
      const label = 'J.A.R.V.I.S. · MARK VIII · NEURAL LINK · ';
      const chars = [...label];
      ctx.save();
      ctx.translate(cx, cy);
      ctx.font = '8.5px "JetBrains Mono", monospace';
      ctx.fillStyle = rgba(accent, 0.42);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      chars.forEach((char, index) => {
        const angle = (index / chars.length) * TAU + phase * 0.05 - Math.PI / 2;
        ctx.save();
        ctx.rotate(angle);
        ctx.translate(0, -R * 1.24);
        ctx.fillText(char, 0, 0);
        ctx.restore();
      });
      ctx.restore();

      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [analyser, mode]);

  return (
    <button
      type="button"
      className={`reactor reactor-${mode}`}
      onClick={onActivate}
      aria-label={mode === 'speaking' ? 'Sprachausgabe stoppen' : 'Jarvis aktivieren'}
    >
      <canvas ref={canvasRef} className="reactor-canvas" aria-hidden="true" />
    </button>
  );
}
