import test from 'node:test';
import assert from 'node:assert/strict';
import { chartSegments, format, ramPercent, readAiStatus, readTelemetry, unavailable } from '../src/telemetry.ts';

test('missing values never turn into zero measurements', () => {
  const result = readTelemetry({});
  assert.equal(result.cpu_percent, null);
  assert.equal(result.gpu_percent, null);
  assert.equal(result.ram_used_gb, null);
  assert.equal(ramPercent(result), null);
  assert.equal(format(result.cpu_temp_c, '°C'), unavailable);
});
test('a genuine zero remains a valid measurement', () => {
  const result = readTelemetry({ cpu_percent: 0, gpu_percent: 0, ram_used_gb: 0, ram_total_gb: 16 });
  assert.equal(result.cpu_percent, 0);
  assert.equal(ramPercent(result), 0);
  assert.equal(format(result.gpu_percent, '%'), '0 %');
});
test('a missing RAM numerator is unavailable even with known capacity', () => {
  assert.equal(ramPercent(readTelemetry({ ram_total_gb: 16 })), null);
});
test('malformed and physically invalid values do not reach the display', () => {
  const result = readTelemetry({ cpu_percent: Infinity, gpu_percent: 101, cpu_temp_c: NaN, gpu_temp_c: -273.15, ram_used_gb: 24, ram_total_gb: 16 });
  assert.equal(result.cpu_percent, null);
  assert.equal(result.gpu_percent, null);
  assert.equal(result.cpu_temp_c, null);
  assert.equal(result.gpu_temp_c, null);
  assert.equal(ramPercent(result), null);
  assert.throws(() => readTelemetry(null));
});
test('history keeps gaps instead of connecting measurements across failures', () => {
  const points = chartSegments([{ cpu: 20, ram: null }, { cpu: 25, ram: null }, { cpu: null, ram: null }, { cpu: 30, ram: null }], 'cpu');
  assert.equal(points.length, 2);
  assert.equal(points[1], '100,70');
  assert.deepEqual(chartSegments([{ cpu: null, ram: null }], 'cpu'), []);
});
test('AI configuration is distinct from absent or invalid backend status', () => {
  assert.deepEqual(readAiStatus({ ready: false, provider: 'Groq' }), { ready: false, provider: 'Groq' });
  assert.throws(() => readAiStatus({}));
  assert.throws(() => readAiStatus({ ready: 'online', provider: 'Groq' }));
});
