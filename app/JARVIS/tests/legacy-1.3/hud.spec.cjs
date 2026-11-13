const { installNeural } = require('./neural-fixture.cjs');
const { test, expect } = require('@playwright/test');
// Synthetic fixtures exist ONLY at the test IPC boundary. The application ships no demo data.
async function mockBackend(page) {
  await installNeural(page);
  await page.addInitScript(() => {
    window.__hudTest = { calls: [], failMetrics: false, failChat: false, pending: 0, maxPending: 0 };
    window.__TAURI_INTERNALS__ = { invoke: async (command, args) => {
      const state = window.__hudTest;
      state.calls.push({ command, args });
      if (command === 'get_system_metrics') {
        state.pending++; state.maxPending = Math.max(state.maxPending, state.pending);
        await new Promise(resolve => setTimeout(resolve, 40));
        state.pending--;
        if (state.failMetrics) throw Error('TEST metrics unavailable');
        return { cpu_percent: 0, ram_used_gb: 8, ram_total_gb: 16, gpu_percent: null, cpu_temp_c: null, gpu_temp_c: null, os_name: 'TEST OS', cpu_name: 'TEST CPU' };
      }
      if (command === 'get_ai_status') return { ready: true, provider: 'Groq' };
      if (command === 'chat_with_groq') {
        if (state.failChat) throw Error('TEST chat failed');
        return '<b>TEST reply</b>';
      }
      if(window.__neuralInvoke)return window.__neuralInvoke(command,args);
      throw Error('Unexpected command');
    } };
  });
}
test('browser without native backend shows no invented values; reference preview', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByText(/Hardware-Abfrage fehlgeschlagen/)).toBeVisible();
  await expect(page.locator('.metric')).toHaveCount(4);
  for (const metric of await page.locator('.metric-content strong').allTextContents()) expect(metric).toBe('Nicht verfügbar');
  await expect(page.getByText('Status nicht verfügbar').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Versandvorschau erstellen', exact: true })).toBeDisabled();
  expect(await page.locator('.bubble').count()).toBe(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.screenshot({ path: 'docs/HUD-Preview.png', fullPage: true });
  expect(errors).toEqual([]);
});
test('native contract, quick actions, safe chat text and backend failure', async ({ page }) => {
  await mockBackend(page); await page.goto('/');
  await expect(page.getByText('TEST CPU', { exact: true })).toBeVisible();
  await expect(page.locator('.metric-content strong').nth(0)).toHaveText('0 %');
  await expect(page.locator('.metric-content strong').nth(2)).toHaveText('50 %');
  await expect(page.getByText('Groq · Konfiguriert').first()).toBeVisible();
  await page.getByRole('button', { name: /KI-Chat öffnen/ }).click();
  await expect(page.getByRole('textbox', { name: 'Nachricht an J.A.R.V.I.S.' })).toBeFocused();
  await page.getByRole('textbox').fill('Testfrage'); await page.getByRole('textbox').press('Enter');
  await page.getByRole('button',{name:'Cloud-Versand bestätigen',exact:true}).click();
  await expect(page.getByText('<b>TEST reply</b>', { exact: true })).toBeVisible();
  expect(await page.locator('.bubble b').count()).toBe(0);
  const requests = await page.evaluate(() => window.__neuralTest.calls.filter(x => x.command === 'ai_send'));
  expect(requests).toEqual([{command:'ai_send',args:{requestId:'test-preview',documentConsent:false,fallbackConsent:false}}]);
  await page.evaluate(() => { window.__hudTest.failChat = true; });
  await page.getByRole('textbox').fill('Zweite Frage'); await page.getByRole('button', { name: 'Versandvorschau erstellen', exact: true }).click();
  await page.getByRole('button',{name:'Cloud-Versand bestätigen',exact:true}).click();
  await expect(page.getByRole('log').getByText(/TEST chat failed/)).toBeVisible();
  await page.getByRole('button', { name: /Konfiguration Lokale/ }).click();
  await expect(page.getByText('Neural Intelligence Console / 1.3.0',{exact:true})).toBeVisible();
  await page.getByRole('button', { name: 'Systemmonitor', exact: true }).click();
  await expect(page.getByText('TEST OS', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Command Center', exact: true }).click();
  await page.evaluate(() => { window.__hudTest.failMetrics = true; });
  await page.getByRole('button', { name: /Neu abfragen/ }).click();
  await expect(page.getByText(/Hardware-Abfrage fehlgeschlagen/)).toBeVisible();
  await expect(page.locator('.metric-content strong').nth(0)).toHaveText('Nicht verfügbar');
  await expect(page.locator('.metric-content strong').nth(2)).toHaveText('Nicht verfügbar');
  expect(await page.evaluate(() => window.__hudTest.maxPending)).toBe(1);
});
test('responsive navigation and reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/');
  await expect(page.getByText(/Hardware-Abfrage fehlgeschlagen/)).toBeVisible();
  expect(await page.locator('.reactor-ring').first().evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  for (const width of [1480, 1024, 720, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
    await expect(page.getByText('Neural Intelligence Console / 1.3.0',{exact:true})).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Command Center', exact: true }).click();
  }
});
