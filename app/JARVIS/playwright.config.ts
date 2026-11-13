import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:1422', viewport: { width: 1480, height: 960 }, launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } },
  webServer: { command: 'npm run dev -- --port 1422', url: 'http://127.0.0.1:1422', reuseExistingServer: false },
  reporter: 'list',
});
