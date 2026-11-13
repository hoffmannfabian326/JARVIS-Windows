const {test,expect}=require('@playwright/test');
const {install}=require('./fixture.cjs');
const voices=[{id:'Microsoft Hedda Desktop',name:'Microsoft Hedda Desktop',culture:'de-DE',gender:'Female',enabled:true},{id:'Microsoft Zira Desktop',name:'Microsoft Zira Desktop',culture:'en-US',gender:'Female',enabled:true},{id:'TEST disabled',name:'TEST disabled',culture:'de-DE',gender:'Male',enabled:false}];
async function open(page){await page.getByRole('navigation',{name:'Dashboard-Module'}).getByRole('button',{name:/Voice/}).click();}
async function setup(page){await install(page,{voices});await page.goto('/');await page.evaluate(v=>{window.__test.voices=v;},voices);await open(page);}
test('TTS test is audible-request capable even when automatic answer reading is off',async({page})=>{
 await setup(page);await page.getByRole('checkbox',{name:'Antworten lokal vorlesen'}).uncheck();await page.getByRole('button',{name:'Stimme testen',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.__test.calls.filter(c=>c.command==='voice_start'&&c.args.request.mode==='speak').length)).toBe(1);
});
test('rescan loads enabled German and English voices, stores choice and restores after restart',async({page})=>{
 await setup(page);await page.getByRole('button',{name:'Stimmen erneut suchen',exact:true}).click();
 const list=page.getByLabel('Deutsche Windows-Stimme',{exact:true});await expect(list).toContainText('Microsoft Hedda Desktop · de-DE');await expect(list).toContainText('Microsoft Zira Desktop · en-US');await expect(list.locator('option[value="TEST disabled"]')).toBeDisabled();
 await list.selectOption('Microsoft Zira Desktop');await expect(page.getByText('Stimmenauswahl gespeichert.',{exact:true})).toBeVisible();await page.reload();await page.evaluate(v=>window.__test.voices=v,voices);await open(page);await page.getByRole('button',{name:'Stimmen erneut suchen',exact:true}).click();await expect(list).toHaveValue('Microsoft Zira Desktop');
});
test('backend failure is distinct from a genuinely empty installed-voices response and retry recovers',async({page})=>{
 await setup(page);await page.evaluate(()=>window.__test.probeError=true);await page.getByRole('button',{name:'Stimmen erneut suchen',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'Stimmen konnten nicht geladen werden'})).toBeVisible();await expect(page.getByText('Windows meldet keine installierten Desktop-Stimmen.',{exact:true})).toHaveCount(0);
 await page.evaluate(()=>{window.__test.probeError=false;window.__test.voices=[];});await page.getByRole('button',{name:'Stimmen erneut suchen',exact:true}).click();await expect(page.getByText('Windows meldet keine installierten Desktop-Stimmen.',{exact:true})).toBeVisible();
 await page.evaluate(v=>window.__test.voices=v,voices);await page.getByRole('button',{name:'Stimmen erneut suchen',exact:true}).click();await expect(page.getByLabel('Deutsche Windows-Stimme',{exact:true})).toContainText('Microsoft Hedda Desktop');
});
test('delayed enumeration does not overwrite a selection made during refresh',async({page})=>{
 await setup(page);await page.getByRole('button',{name:'Stimmen erneut suchen',exact:true}).click();await page.evaluate(()=>window.__test.probeDelay=400);await page.getByRole('button',{name:'Stimmen erneut suchen',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Stimmen werden geladen'})).toBeVisible();await page.getByLabel('Deutsche Windows-Stimme',{exact:true}).selectOption('Microsoft Zira Desktop');await expect(page.getByRole('button',{name:'Stimmen erneut suchen',exact:true})).toBeEnabled();await expect(page.getByLabel('Deutsche Windows-Stimme',{exact:true})).toHaveValue('Microsoft Zira Desktop');
});
test('enumeration and storage failures stay visible; speaking failure is not a successful sound test',async({page})=>{
 await setup(page);await page.getByRole('button',{name:'Stimmen erneut suchen',exact:true}).click();await page.evaluate(()=>window.__test.failSave=true);await page.getByLabel('Deutsche Windows-Stimme',{exact:true}).selectOption('Microsoft Zira Desktop');await expect(page.getByRole('alert').filter({hasText:'nicht gespeichert'})).toBeVisible();
 await page.evaluate(()=>window.__test.failStart=true);await page.getByRole('button',{name:'Stimme testen',exact:true}).click();await expect(page.getByText('Stimmtest fehlgeschlagen oder abgebrochen.',{exact:true})).toBeVisible();
 await page.evaluate(()=>window.__test.ttsError='TEST: COM discovery failed');await page.getByRole('button',{name:'Stimmen erneut suchen',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'Stimmen konnten nicht geladen werden'})).toBeVisible();
});
