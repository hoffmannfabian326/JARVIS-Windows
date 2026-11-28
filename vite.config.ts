import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Erlaubt /api nur von localhost und der eigenen Vorschau. Loopback-Hosts
 * gelten nur für echte Loopback-Verbindungen, damit ein gefälschter
 * Host-Header aus dem Netz nicht durchkommt. Die Vorschau-Hosts kommen aus
 * derselben Variable, die Vite für erlaubte Hosts nutzt.
 */
function apiGuard(): Plugin {
  const previewHosts = new Set<string>();
  for (const host of (process.env.__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS ?? '').split(',')) {
    const value = host.trim().toLowerCase();
    if (value) previewHosts.add(value);
  }

  const isLoopbackAddress = (address?: string): boolean => {
    const value = String(address ?? '');
    return value === '127.0.0.1' || value === '::1' || value.startsWith('::ffff:127.');
  };

  const guard: Connect.NextHandleFunction = (req, res, next) => {
    if (!req.url?.startsWith('/api')) {
      next();
      return;
    }

    const hostname = String(req.headers.host ?? '')
      .replace(/:\d+$/, '')
      .toLowerCase();
    const isLoopbackHost = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname);
    const allowed =
      previewHosts.has(hostname) ||
      (isLoopbackHost && isLoopbackAddress(req.socket.remoteAddress));

    if (allowed) {
      next();
      return;
    }

    console.warn(`[api-guard] blockiert: host=${req.headers.host} von ${req.socket.remoteAddress}`);
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'forbidden' }));
  };

  return {
    name: 'jarvis-api-guard',
    configureServer(server) {
      server.middlewares.use(guard);
    },
    configurePreviewServer(server) {
      server.middlewares.use(guard);
    },
  };
}

const proxy = {
  '/api': {
    target: 'http://127.0.0.1:8787',
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react(), apiGuard()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    proxy,
    // Der Key wird vom Proxy live gelesen; Vite soll die Seite dafür nicht
    // neu laden (wir nutzen keine VITE_*-Variablen im Client).
    watch: {
      ignored: ['**/.env', '**/.env.*'],
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
    proxy,
  },
});
