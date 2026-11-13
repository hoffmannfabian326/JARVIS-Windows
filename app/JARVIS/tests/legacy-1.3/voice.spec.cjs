const { installNeural } = require('./neural-fixture.cjs');
const { test, expect } = require('@playwright/test');
// Only test IPC fixtures: no actual microphone, TTS, keys or cloud requests.
async function voiceBackend(page, delayStart = false) {
  await installNeural(page);
  await page.addInitScript(({ delayStart }) => {
    window.__voiceTest = { calls: [], session: null, allow: false, slow: delayStart, started: false };
    window.__TAURI_INTERNALS__ = { invoke: async (command, args) => {
      const t = window.__voiceTest; t.calls.push({ command, args });
      if (command === 'get_system_metrics') return { cpu_percent: 0, ram_used_gb: 1, ram_total_gb: 8, os_name: 'TEST OS', cpu_name: 'TEST CPU' };
      if (command === 'get_ai_status') return { ready: true, provider: 'Groq' };
      if (command === 'voice_capabilities') return { available: true, recognition: true, note: 'TEST local engine', voices: [{ id: 'test-male', name: 'TEST German Voice', gender: 'Male', culture: 'de-DE' }] };
      if (command === 'voice_permission') { t.allow = args.allowed; return; }
      if (command === 'voice_start') {
        if (args.request.mode === 'listen' && !t.allow) throw Error('No permission');
        t.started = true;
        if (t.slow) await new Promise(resolve => setTimeout(resolve, 300));
        t.session = { session_id: String(t.calls.length), mode: args.request.mode, state: args.request.mode === 'listen' ? 'listening' : 'speaking', level: args.request.mode === 'listen' ? 23 : null, transcript: '', error: null };
        return { ...t.session };
      }
      if (command === 'voice_snapshot') return { ...t.session };
      if (command === 'voice_finish') { t.session.state = 'complete'; t.session.level = null; t.session.transcript = 'Dies ist erkannter TEST Text'; return; }
      if (command === 'voice_cancel') { if (t.session) { t.session.state = 'cancelled'; t.session.transcript = ''; } return; }
      if (command === 'chat_with_groq') { if (t.chatDelay) await new Promise(resolve => setTimeout(resolve, t.chatDelay)); return 'TEST KI-Antwort'; }
      if(window.__neuralInvoke)return window.__neuralInvoke(command,args);
      throw Error('Unexpected command');
    } };
  }, { delayStart });
}
test('microphone consent, keyboard PTT, measured reactor, edit and explicit send', async ({ page }) => {
  await voiceBackend(page); await page.goto('/');
  const button = page.getByRole('button', { name: 'Push-to-Talk: Zum Sprechen halten' });
  await expect(button).toBeDisabled();
  expect(await page.evaluate(() => window.__voiceTest.calls.filter(x => x.command === 'voice_start').length)).toBe(0);
  await page.getByRole('checkbox', { name: /Ich erlaube das Mikrofon/ }).check();
  await expect(button).toBeEnabled(); await button.focus(); await page.keyboard.down('Space');
  await expect(page.getByText('MIKROFON AKTIV')).toBeVisible();
  await expect(page.locator('.native-level-ring')).toHaveAttribute('stroke-dasharray', '23 100');
  await page.keyboard.up('Space');
  await expect(page.getByRole('textbox')).toHaveValue('Dies ist erkannter TEST Text');
  expect(await page.evaluate(() => window.__neuralTest.calls.filter(x => x.command === 'ai_send').length)).toBe(0);
  await page.getByRole('textbox').fill('Bearbeiteter und bestätigter Text');
  await page.getByRole('button', { name: 'Erkannten Text zur Versandprüfung vorbereiten' }).click();
  await page.getByRole('button',{name:'Cloud-Versand bestätigen',exact:true}).click();
  await expect(page.getByText('TEST KI-Antwort', { exact: true })).toBeVisible();
  const chats = await page.evaluate(() => window.__neuralTest.calls.filter(x => x.command === 'ai_send'));
  expect(chats).toHaveLength(1);expect(await page.evaluate(()=>window.__neuralTest.preview.question)).toBe('Bearbeiteter und bestätigter Text');
  expect(await page.evaluate(() => window.__voiceTest.calls.filter(x => x.command === 'voice_start' && x.args.request.mode === 'speak').length)).toBe(0);
});
test('opt-in TTS uses selected local voice, volume and speed; off cancels', async ({ page }) => {
  await voiceBackend(page); await page.goto('/');
  await page.getByText('Stimme & Sprachausgabe', { exact: true }).click();
  await expect(page.getByLabel('Deutsche Windows-Stimme', { exact: true })).toHaveValue('test-male');
  await page.getByRole('checkbox', { name: 'KI-Antworten lokal vorlesen' }).check();
  await page.getByLabel('Sprachlautstärke', { exact: true }).fill('45');
  await page.getByLabel('Sprechgeschwindigkeit', { exact: true }).fill('-3');
  await page.getByRole('textbox').fill('TEST Nachricht');
  await page.getByRole('button', { name: 'Versandvorschau erstellen', exact: true }).click();
  await page.getByRole('button',{name:'Cloud-Versand bestätigen',exact:true}).click();
  await expect(page.getByText('LOKALE SPRACHAUSGABE', { exact: true })).toBeVisible();
  const speech = await page.evaluate(() => window.__voiceTest.calls.filter(x => x.command === 'voice_start'));
  expect(speech).toHaveLength(1);
  expect(speech[0].args.request).toEqual({ mode: 'speak', voice: 'test-male', text: 'TEST KI-Antwort', volume: 45, rate: -3 });
  await page.getByRole('checkbox', { name: 'KI-Antworten lokal vorlesen' }).uncheck();
  await expect.poll(() => page.evaluate(() => window.__voiceTest.calls.filter(x => x.command === 'voice_cancel').length)).toBeGreaterThan(0);
});
test('escape cancels even while native start is pending; no transcript or upload', async ({ page }) => {
  await voiceBackend(page, true); await page.goto('/');
  await page.getByRole('checkbox', { name: /Ich erlaube das Mikrofon/ }).check();
  const button = page.getByRole('button', { name: 'Push-to-Talk: Zum Sprechen halten' });
  await button.focus(); await page.keyboard.down('Space');
  await expect.poll(() => page.evaluate(() => window.__voiceTest.started)).toBe(true);
  await page.keyboard.press('Escape'); await page.keyboard.up('Space');
  await expect.poll(() => page.evaluate(() => window.__voiceTest.calls.filter(x => x.command === 'voice_cancel').length)).toBeGreaterThan(0);
  await expect(page.getByRole('textbox')).toHaveValue('');
  expect(await page.evaluate(() => window.__neuralTest.calls.filter(x => x.command === 'ai_send').length)).toBe(0);
});
test('release during engine startup finishes safely and focus loss discards recording', async ({ page }) => {
  await voiceBackend(page, true); await page.goto('/');
  await page.getByRole('checkbox', { name: /Ich erlaube das Mikrofon/ }).check();
  const button = page.getByRole('button', { name: 'Push-to-Talk: Zum Sprechen halten' });
  await button.focus(); await page.keyboard.down('Enter'); await page.keyboard.up('Enter');
  await expect(page.getByRole('textbox')).toHaveValue('Dies ist erkannter TEST Text');
  expect(await page.evaluate(() => window.__voiceTest.calls.filter(x => x.command === 'voice_finish').length)).toBe(1);
  await button.focus(); await page.keyboard.down('Space');
  await expect(page.getByText('MIKROFON AKTIV')).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.keyboard.up('Space');
  await expect.poll(() => page.evaluate(() => window.__voiceTest.calls.filter(x => x.command === 'voice_cancel').length)).toBeGreaterThan(0);
});
test('revoking microphone consent stops the action and prevents another start', async ({ page }) => {
  await voiceBackend(page); await page.goto('/');
  const permission = page.getByRole('checkbox', { name: /Ich erlaube das Mikrofon/ });
  await permission.check();
  const button = page.getByRole('button', { name: 'Push-to-Talk: Zum Sprechen halten' });
  await button.focus(); await page.keyboard.down('Space');
  await expect(page.getByText('MIKROFON AKTIV')).toBeVisible();
  await permission.uncheck(); await page.keyboard.up('Space');
  await expect(button).toBeDisabled();
  await expect.poll(() => page.evaluate(() => window.__voiceTest.allow)).toBe(false);
  expect(await page.evaluate(() => window.__voiceTest.calls.some(x => x.command === 'voice_cancel'))).toBe(true);
  await expect(page.getByRole('textbox')).toHaveValue('');
});

test('turning speech output off before a delayed reply prevents audio playback', async ({ page }) => {
  await voiceBackend(page); await page.goto('/');
  await page.getByText('Stimme & Sprachausgabe', { exact: true }).click();
  const output = page.getByRole('checkbox', { name: 'KI-Antworten lokal vorlesen' });
  await output.check();
  await page.evaluate(() => { window.__voiceTest.chatDelay = 400; });
  await page.getByRole('textbox').fill('TEST verspätete Antwort');
  await page.getByRole('button', { name: 'Versandvorschau erstellen', exact: true }).click();
  await page.getByRole('button',{name:'Cloud-Versand bestätigen',exact:true}).click();
  await output.uncheck();
  await expect(page.getByText('TEST KI-Antwort', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__voiceTest.calls.filter(x => x.command === 'voice_start').length)).toBe(0);
});
test('a reply received during recording is spoken only after recording finishes', async ({ page }) => {
  await voiceBackend(page); await page.goto('/');
  await page.getByText('Stimme & Sprachausgabe', { exact: true }).click();
  await page.getByRole('checkbox', { name: 'KI-Antworten lokal vorlesen' }).check();
  await page.getByRole('checkbox', { name: /Ich erlaube das Mikrofon/ }).check();
  await page.evaluate(() => { window.__voiceTest.chatDelay = 600; });
  await page.getByRole('textbox').fill('TEST vorherige Nachricht');
  await page.getByRole('button', { name: 'Versandvorschau erstellen', exact: true }).click();
  await page.getByRole('button',{name:'Cloud-Versand bestätigen',exact:true}).click();
  const button = page.getByRole('button', { name: 'Push-to-Talk: Zum Sprechen halten' });
  await button.focus(); await page.keyboard.down('Space');
  await expect(page.getByText('MIKROFON AKTIV')).toBeVisible();
  await expect(page.getByText('TEST KI-Antwort', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__voiceTest.calls.filter(x => x.command === 'voice_start' && x.args.request.mode === 'speak').length)).toBe(0);
  await page.keyboard.up('Space');
  await expect(page.getByText('LOKALE SPRACHAUSGABE', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__neuralTest.calls.filter(x => x.command === 'ai_send').length)).toBe(1);
});
