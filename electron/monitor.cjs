'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const si = require('systeminformation');

/** Zustimmung wird einmalig im Benutzerverzeichnis gespeichert. */
function consentFile() {
  return path.join(app.getPath('userData'), 'monitor-consent.json');
}

function getConsent() {
  try {
    const raw = JSON.parse(fs.readFileSync(consentFile(), 'utf8'));
    return typeof raw?.granted === 'boolean' ? raw.granted : null;
  } catch {
    return null;
  }
}

function setConsent(granted) {
  try {
    fs.mkdirSync(path.dirname(consentFile()), { recursive: true });
    fs.writeFileSync(consentFile(), JSON.stringify({ granted: Boolean(granted), at: new Date().toISOString() }));
  } catch {
    /* nicht schreibbar: Zustimmung gilt nur für diese Sitzung */
  }
  return Boolean(granted);
}

function pickGpu(graphics) {
  const controllers = graphics?.controllers ?? [];
  return (
    controllers.find((c) => c.utilizationGpu != null || c.temperatureGpu != null) ??
    controllers.find((c) => c.model) ??
    null
  );
}

async function sample() {
  const [load, temperature, mem, graphics, disks, networks] = await Promise.all([
    si.currentLoad().catch(() => null),
    si.cpuTemperature().catch(() => null),
    si.mem().catch(() => null),
    si.graphics().catch(() => null),
    si.fsSize().catch(() => []),
    si.networkStats().catch(() => []),
  ]);

  const gpu = pickGpu(graphics);
  const cpuTemp = typeof temperature?.main === 'number' && temperature.main > 0 ? Math.round(temperature.main) : null;

  return {
    at: Date.now(),
    cpu: {
      load: load ? Math.round(load.currentLoad) : null,
      temp: cpuTemp,
      cores: load?.cpus?.length ?? null,
    },
    gpu: {
      name: gpu?.model ?? null,
      load: typeof gpu?.utilizationGpu === 'number' ? Math.round(gpu.utilizationGpu) : null,
      temp: typeof gpu?.temperatureGpu === 'number' ? Math.round(gpu.temperatureGpu) : null,
      vramUsed: Number.isFinite(gpu?.memoryUsed) ? Math.round(gpu.memoryUsed) : null,
      vramTotal: Number.isFinite(gpu?.memoryTotal) ? Math.round(gpu.memoryTotal) : null,
    },
    mem: mem
      ? {
          used: mem.used,
          total: mem.total,
          percent: Math.round((mem.used / mem.total) * 100),
        }
      : null,
    disk: (() => {
      const disk = (disks ?? []).find((entry) => entry.size > 0) ?? null;
      if (!disk) return null;
      return {
        used: disk.used,
        size: disk.size,
        percent: Math.round(disk.use ?? (disk.used / disk.size) * 100),
        mount: disk.mount ?? null,
      };
    })(),
    net: (() => {
      const active = (networks ?? []).filter((entry) => entry.operstate === 'up' && !entry.virtual);
      const list = active.length ? active : networks ?? [];
      if (!list.length) return null;
      const down = list.reduce((sum, entry) => sum + Math.max(0, entry.rx_sec ?? 0), 0);
      const up = list.reduce((sum, entry) => sum + Math.max(0, entry.tx_sec ?? 0), 0);
      return { down, up };
    })(),
  };
}

module.exports = { getConsent, setConsent, sample };
