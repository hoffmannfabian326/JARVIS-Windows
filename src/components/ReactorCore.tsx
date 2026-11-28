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

function rgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const value = parseInt(clean, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

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
      const R = Math.min(width, height) * 0.4;
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

      // Halo
      const halo = ctx.createRadialGradient(cx, cy, R * 0.05, cx, cy, R * 1.55);
      halo.addColorStop(0, rgba(accent, 0.2 + level * 0.18));
      halo.addColorStop(0.42, rgba(accent, 0.06));
      halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.55, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(cx, cy);

      // Äußerer Skalenring
      ctx.rotate(phase * 0.1);
      ctx.strokeStyle = rgba(accent, 0.32);
      for (let i = 0; i < 72; i += 1) {
        const angle = (i / 72) * Math.PI * 2;
        const major = i % 6 === 0;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * R * 1.33, Math.sin(angle) * R * 1.33);
        ctx.lineTo(
          Math.cos(angle) * R * (major ? 1.42 : 1.37),
          Math.sin(angle) * R * (major ? 1.42 : 1.37),
        );
        ctx.lineWidth = major ? 1.4 : 0.6;
        ctx.stroke();
      }
      ctx.restore();

      // Kreissegment-Abschnitte
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-phase * 0.5);
      ctx.strokeStyle = rgba(accent, 0.55);
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      for (let i = 0; i < 4; i += 1) {
        const start = (i / 4) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(0, 0, R * 1.1, start, start + 0.9);
        ctx.stroke();
      }
      ctx.restore();

      // Radar-Sweep
      ctx.save();
      ctx.translate(cx, cy);
      const createConic = (ctx as any).createConicGradient;
      if (typeof createConic === 'function') {
        const sweep = createConic.call(ctx, -phase * 1.4, 0, 0);
        sweep.addColorStop(0, rgba(accent, 0));
        sweep.addColorStop(0.12, rgba(accent, 0.16 + level * 0.1));
        sweep.addColorStop(0.19, rgba(accent, 0));
        sweep.addColorStop(1, rgba(accent, 0));
        ctx.fillStyle = sweep;
        ctx.beginPath();
        ctx.arc(0, 0, R * 1.06, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Gestrichelter Orbit
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-phase * 0.28);
      ctx.setLineDash([2, 11]);
      ctx.strokeStyle = rgba(accent, 0.5);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, R * 1.19, 0, Math.PI * 2);
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
        const angle = (i / points) * Math.PI * 2 - Math.PI / 2;
        const radius = R * 0.885 - v * R * 0.16 * (0.5 + level * 1.8);
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = rgba(accent, 0.9);
      ctx.lineWidth = 1.3;
      ctx.shadowColor = rgba(accent, 0.8);
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();

      // Kern
      ctx.save();
      ctx.translate(cx, cy);
      const pulse = 1 + Math.sin(phase * 2.1) * 0.02 + level * 0.3;
      const coreR = R * 0.46 * pulse;
      const core = ctx.createRadialGradient(0, 0, coreR * 0.05, 0, 0, coreR);
      core.addColorStop(0, rgba('#ffffff', 0.85));
      core.addColorStop(0.18, rgba(accent, 0.85));
      core.addColorStop(0.52, rgba(accent, 0.24));
      core.addColorStop(1, rgba(accent, 0));
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(0, 0, coreR, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = rgba(accent, 0.55);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.4, 0, Math.PI * 2);
      ctx.stroke();

      // Fadenkreuz
      ctx.strokeStyle = rgba(accent, 0.4);
      for (let i = 0; i < 4; i += 1) {
        ctx.save();
        ctx.rotate((i / 4) * Math.PI * 2 + phase * 0.2);
        ctx.beginPath();
        ctx.moveTo(R * 0.5, 0);
        ctx.lineTo(R * 0.56, 0);
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();

      // Umlaufende Beschriftung
      const label = 'J.A.R.V.I.S. · MARK VII · VOICE LINK · ';
      const chars = [...label];
      ctx.save();
      ctx.translate(cx, cy);
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillStyle = rgba(accent, 0.45);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      chars.forEach((char, index) => {
        const angle = (index / chars.length) * Math.PI * 2 + phase * 0.05 - Math.PI / 2;
        ctx.save();
        ctx.rotate(angle);
        ctx.translate(0, -R * 1.21);
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
