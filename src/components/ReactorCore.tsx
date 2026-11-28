import { useEffect, useRef } from 'react';
import type { Mode } from '../types';
import fireRing from '../assets/fire-ring.jpg';

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

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

interface Ember {
  angle: number;
  radius: number;
  squash: number;
  speed: number;
  size: number;
  wobble: number;
  wobbleSpeed: number;
  depth: number;
}

function buildRing(count: number, centerR: number, spread: number, seed: number): Ember[] {
  const random = seeded(seed);
  return Array.from({ length: count }, () => {
    const offset = (random() + random() + random() - 1.5) / 1.5;
    return {
      angle: random() * TAU,
      radius: centerR + offset * spread,
      squash: 0.86 + random() * 0.18,
      speed: (0.06 + random() * 0.16) * (random() > 0.86 ? -1 : 1),
      size: 0.8 + random() * 2.2,
      wobble: random() * TAU,
      wobbleSpeed: 0.5 + random() * 1.7,
      depth: 0.3 + random() * 0.7,
    };
  });
}

function buildEmbers(count: number, minR: number, maxR: number, seed: number): Ember[] {
  const random = seeded(seed);
  return Array.from({ length: count }, () => ({
    angle: random() * TAU,
    radius: minR + random() * (maxR - minR),
    squash: 0.82 + random() * 0.22,
    speed: (0.05 + random() * 0.18) * (random() > 0.85 ? -1 : 1),
    size: 1 + random() * 2.6,
    wobble: random() * TAU,
    wobbleSpeed: 0.4 + random() * 1.8,
    depth: 0.25 + random() * 0.75,
  }));
}

interface Streak {
  angle: number;
  radius: number;
  speed: number;
  length: number;
}

function buildStreaks(count: number, seed: number): Streak[] {
  const random = seeded(seed);
  return Array.from({ length: count }, () => ({
    angle: random() * TAU,
    radius: 0.7 + random() * 0.6,
    speed: 0.25 + random() * 0.7,
    length: 0.05 + random() * 0.12,
  }));
}

interface Flare {
  angle: number;
  radius: number;
  length: number;
  speed: number;
}

function buildFlares(count: number, seed: number): Flare[] {
  const random = seeded(seed);
  return Array.from({ length: count }, () => ({
    angle: random() * TAU,
    radius: 0.6 + random() * 0.32,
    length: 0.12 + random() * 0.32,
    speed: (random() > 0.5 ? 1 : -1) * (0.04 + random() * 0.1),
  }));
}

function glowSprite(inner: string, outer: string): HTMLCanvasElement {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(0.35, outer);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

/**
 * Der gerenderte Ring kommt auf Schwarz. Für den additiven Modus wird das
 * Schwarz einmalig in Transparenz umgerechnet, sonst läge ein dunkles Quadrat
 * über dem Panel.
 */
function keyOutBlack(image: HTMLImageElement): HTMLCanvasElement {
  const size = Math.min(1024, image.naturalWidth || 1024);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.drawImage(image, 0, 0, size, size);
  const frame = ctx.getImageData(0, 0, size, size);
  const data = frame.data;
  for (let i = 0; i < data.length; i += 4) {
    const max = Math.max(data[i], data[i + 1], data[i + 2]);
    data[i + 3] = max > 24 ? Math.min(255, (max - 24) * 1.45) : 0;
  }
  ctx.putImageData(frame, 0, 0);
  return canvas;
}

let flameSprite: HTMLCanvasElement | null = null;
const flameImage = new Image();
flameImage.src = fireRing;
flameImage.addEventListener('load', () => {
  flameSprite = keyOutBlack(flameImage);
});

/**
 * Der Kern: eine gerenderte Feuerfontäne, die langsam rotiert und flackert,
 * darüber feine Glutpartikel, Flammenarme und Funken. Die Stimme treibt
 * Helligkeit, Tempo und Größe.
 */
export default function ReactorCore({ mode, analyser, onActivate }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const phaseRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
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

    const pale = glowSprite('rgba(255, 252, 240, 0.95)', 'rgba(255, 196, 110, 0.55)');
    const warm = glowSprite('rgba(255, 214, 150, 0.9)', 'rgba(255, 120, 28, 0.45)');
    const deep = glowSprite('rgba(255, 170, 80, 0.6)', 'rgba(210, 70, 12, 0.28)');

    const belt = buildRing(230, 0.94, 0.2, 17);
    const dust = buildEmbers(46, 1.1, 1.45, 41);
    const streaks = buildStreaks(26, 101);
    const flares = buildFlares(9, 707);

    const wave = new Uint8Array(256).fill(128);
    let level = 0;
    let previous = performance.now();
    let frame = 0;

    const draw = (timestamp: number) => {
      const delta = Math.min(0.06, (timestamp - previous) / 1000);
      previous = timestamp;
      const tempo = mode === 'thinking' ? 1.35 : mode === 'speaking' ? 1 : mode === 'off' ? 0.55 : 0.8;
      phaseRef.current += delta * tempo;

      const accent = ACCENT[mode];
      const cx = width / 2;
      const cy = height / 2;
      const R = Math.min(width, height) * 0.355;
      const phase = phaseRef.current;
      const dim = mode === 'off' ? 0.5 : mode === 'wake' ? 0.8 : 1;

      if (analyser) {
        analyser.getByteTimeDomainData(wave);
        let sum = 0;
        for (let i = 0; i < wave.length; i += 1) {
          const v = (wave[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / wave.length);
        level += (Math.min(1, rms * 3.4) - level) * 0.18;
      } else {
        level += (0 - level) * 0.08;
      }

      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.translate(cx, cy);

      // Dunkle Scheibe unter dem Feuer, damit der Ring auf dem Panel steht.
      const base = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 1.7);
      base.addColorStop(0, 'rgba(44, 18, 5, 0.42)');
      base.addColorStop(0.55, 'rgba(18, 8, 3, 0.34)');
      base.addColorStop(0.82, 'rgba(10, 5, 2, 0.16)');
      base.addColorStop(1, 'rgba(4, 2, 1, 0)');
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.arc(0, 0, R * 1.7, 0, TAU);
      ctx.fill();

      // Rauchschleier, gegenläufig drehend
      for (let i = 0; i < 2; i += 1) {
        ctx.save();
        ctx.rotate(phase * (0.04 + i * 0.026) + i * 1.7);
        const smoke = ctx.createRadialGradient(R * 0.4, 0, 0, R * 0.4, 0, R * 0.95);
        smoke.addColorStop(0, 'rgba(255, 120, 30, 0.055)');
        smoke.addColorStop(0.55, 'rgba(190, 70, 14, 0.03)');
        smoke.addColorStop(1, 'rgba(120, 40, 8, 0)');
        ctx.fillStyle = smoke;
        ctx.beginPath();
        ctx.ellipse(R * 0.4, 0, R * 0.95, R * 0.62, 0.4 + i * 0.3, 0, TAU);
        ctx.fill();
        ctx.restore();
      }

      ctx.globalCompositeOperation = 'lighter';

      // Die Feuerfontäne: zwei leicht versetzte, gegeneinander drehende Ebenen.
      if (flameSprite) {
        const breath = 1 + Math.sin(phase * 1.7) * 0.012 + level * 0.035;
        const side = R * 2.55 * breath;
        ctx.globalAlpha = dim * (0.9 + Math.sin(phase * 6.4) * 0.05 + level * 0.12);
        ctx.save();
        ctx.rotate(phase * 0.045);
        ctx.drawImage(flameSprite, -side / 2, -side / 2, side, side);
        ctx.restore();

        ctx.globalAlpha = dim * 0.14;
        ctx.save();
        ctx.rotate(-phase * 0.028 + 0.8);
        const wide = side * 1.06;
        ctx.drawImage(flameSprite, -wide / 2, -wide / 2, wide, wide);
        ctx.restore();
      }

      // Feine Glut auf und um dem Ring: bringt Bewegung in das Standbild.
      const drawEmber = (ember: Ember, sprite: HTMLCanvasElement, scale: number) => {
        ember.angle += ember.speed * delta * (0.6 + tempo * 0.7 + level * 1.4);
        const wobble = Math.sin(phase * ember.wobbleSpeed + ember.wobble) * 0.045;
        const radius = R * ember.radius * (1 + wobble + level * 0.035);
        const x = Math.cos(ember.angle) * radius;
        const y = Math.sin(ember.angle) * radius * ember.squash;
        const size = ember.size * scale * (0.55 + ember.depth * 0.75) * (0.8 + level * 0.7);
        ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
      };

      ctx.globalAlpha = dim * 0.3;
      for (const ember of dust) drawEmber(ember, deep, 3.6);
      ctx.globalAlpha = dim * 0.7;
      for (const ember of belt) drawEmber(ember, warm, 3.8);

      // Funken, die nach außen schießen
      ctx.globalAlpha = 1;
      for (const streak of streaks) {
        streak.radius += streak.speed * delta * (0.35 + level * 0.8);
        if (streak.radius > 1.5) {
          streak.radius = 0.8;
          streak.angle = Math.random() * TAU;
        }
        const fade = Math.max(0, 1 - (streak.radius - 0.8) / 0.7);
        const inner = R * streak.radius;
        const outer = R * (streak.radius + streak.length * (0.6 + level));
        const x1 = Math.cos(streak.angle) * inner;
        const y1 = Math.sin(streak.angle) * inner * 0.94;
        const x2 = Math.cos(streak.angle) * outer;
        const y2 = Math.sin(streak.angle) * outer * 0.94;
        ctx.strokeStyle = rgba('#ffd9a4', 0.6 * fade * dim);
        ctx.lineWidth = 0.9 + fade * 0.9;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      // Flammenarme lecken tangential am Ring entlang.
      for (const flare of flares) {
        flare.angle += flare.speed * delta;
        const radius = R * (flare.radius + 0.16 + Math.sin(phase * 0.6 + flare.angle) * 0.03);
        const sweep = flare.length * (0.8 + level * 0.5);
        ctx.beginPath();
        ctx.arc(0, 0, radius, flare.angle, flare.angle + sweep);
        ctx.strokeStyle = rgba('#ffd2a0', 0.34 * dim);
        ctx.lineWidth = 1.2;
        ctx.stroke();
        const headX = Math.cos(flare.angle + sweep) * radius;
        const headY = Math.sin(flare.angle + sweep) * radius;
        ctx.globalAlpha = 0.7 * dim;
        ctx.drawImage(pale, headX - 3, headY - 3, 6, 6);
        ctx.globalAlpha = 1;
      }

      // Pulsierende Glut in der Mitte, gekoppelt an die Stimme.
      const pulse = 1 + Math.sin(phase * 2.3) * 0.04 + level * 0.28;
      const core = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.5 * pulse);
      core.addColorStop(0, 'rgba(255, 252, 240, 0.5)');
      core.addColorStop(0.3, 'rgba(255, 210, 130, 0.24)');
      core.addColorStop(0.7, 'rgba(255, 140, 40, 0.08)');
      core.addColorStop(1, 'rgba(255, 100, 20, 0)');
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.5 * pulse, 0, TAU);
      ctx.fill();

      // Umlaufende Funken außerhalb des Rings
      for (let i = 0; i < 3; i += 1) {
        const angle = phase * (0.5 + i * 0.17) + (i / 3) * TAU;
        const radius = R * (1.28 + i * 0.06);
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        ctx.globalAlpha = 0.85 * dim;
        ctx.fillStyle = rgba(accent, 0.9);
        ctx.beginPath();
        ctx.arc(x, y, 1.7, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Vignette: das Feuer läuft am Rand ins Dunkel aus, als Kreis, damit
      // kein dunkler Kasten über dem Raster liegt.
      ctx.globalCompositeOperation = 'source-over';
      const vignette = ctx.createRadialGradient(0, 0, R * 0.55, 0, 0, R * 1.72);
      vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vignette.addColorStop(0.62, 'rgba(6, 3, 1, 0.1)');
      vignette.addColorStop(0.88, 'rgba(5, 2, 1, 0.5)');
      vignette.addColorStop(1, 'rgba(4, 2, 1, 0)');
      ctx.fillStyle = vignette;
      ctx.beginPath();
      ctx.arc(0, 0, R * 1.72, 0, TAU);
      ctx.fill();

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
