export const unavailable = 'Nicht verfügbar';
export type Telemetry = {
  cpu_percent: number | null; ram_used_gb: number | null; ram_total_gb: number | null;
  gpu_percent: number | null; cpu_temp_c: number | null; gpu_temp_c: number | null;
  os_name: string; cpu_name: string;
};
export type AiStatus = { ready: boolean; provider: string };
export type Sample = { cpu: number | null; ram: number | null };
const record = (value: unknown): Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Ungültige Backend-Antwort');
  return value as Record<string, unknown>;
};
const number = (value: unknown, min: number, max = Infinity): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null;
const label = (value: unknown) => typeof value === 'string' && value.trim() ? value : unavailable;
export function readTelemetry(value: unknown): Telemetry {
  const raw = record(value);
  const total = number(raw.ram_total_gb, Number.MIN_VALUE);
  return {
    cpu_percent: number(raw.cpu_percent, 0, 100), gpu_percent: number(raw.gpu_percent, 0, 100),
    ram_total_gb: total, ram_used_gb: number(raw.ram_used_gb, 0, total ?? Infinity),
    cpu_temp_c: number(raw.cpu_temp_c, -100, 250), gpu_temp_c: number(raw.gpu_temp_c, -100, 250),
    os_name: label(raw.os_name), cpu_name: label(raw.cpu_name),
  };
}
export function readAiStatus(value: unknown): AiStatus {
  const raw = record(value);
  if (typeof raw.ready !== 'boolean' || typeof raw.provider !== 'string') throw new Error('Ungültiger KI-Status');
  return { ready: raw.ready, provider: raw.provider };
}
export const ramPercent = (value: Telemetry | null) =>
  value?.ram_used_gb != null && value.ram_total_gb != null ? value.ram_used_gb / value.ram_total_gb * 100 : null;
export const format = (value: number | null | undefined, unit: string, decimals = 1) =>
  value == null || !Number.isFinite(value) ? unavailable : `${value.toLocaleString('de-DE', { maximumFractionDigits: decimals })} ${unit}`;
export function chartSegments(samples: Sample[], kind: keyof Sample): string[] {
  const segments: string[] = [];
  let current: string[] = [];
  samples.forEach((sample, i) => {
    const value = sample[kind];
    if (value == null) {
      if (current.length) segments.push(current.join(' '));
      current = [];
    } else current.push(`${i / Math.max(1, samples.length - 1) * 100},${100 - value}`);
  });
  if (current.length) segments.push(current.join(' '));
  return segments;
}
