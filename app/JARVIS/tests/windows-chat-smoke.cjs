// Runs ONLY on an isolated Windows CI runner, against the real Tauri/WebView2 app.
// No request interception or mocked Tauri commands. No real API key or cloud call.
const {chromium,expect}=require('@playwright/test');
const {spawn,execFileSync}=require('node:child_process');const fs=require('node:fs');const path=require('node:path');const net=require('node:net');
const [binary,output]=process.argv.slice(2);if(!binary||!output)throw Error('Binary and output paths required');fs.mkdirSync(output,{recursive:true});
const report={real_tauri_app:true,tauri_ipc:false,text_input:false,core_preview:false,provider_switch:false,network_error:false,voice_panel:false,real_provider_success:false,real_api_key_used:false,microphone_opened:false,dummy_key_deleted:false,phase:'launch'};
(async()=>{
 const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 let app,browser,page,dummyStored=false;
 try{
  app=spawn(binary,[],{stdio:'ignore',env:{...process.env,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1 --force-renderer-accessibility`,WEBVIEW2_USER_DATA_FOLDER:path.join(process.env.RUNNER_TEMP,'jarvis-chat-cdp-'+port)}});
  const deadline=Date.now()+45000;while(Date.now()<deadline){try{const r=await fetch(`http://127.0.0.1:${port}/json/version`);if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,300));}
  report.phase='connect_webview';browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context=browser.contexts()[0];if(!context)throw Error('WebView2 context unavailable');
  for(let i=0;i<100;i++){page=context.pages().find(p=>p.url().includes('tauri.localhost'));if(page)break;await new Promise(r=>setTimeout(r,200));}
  if(!page)throw Error('Real Tauri asset page unavailable');
  await expect(page.getByRole('button',{name:'KI-Chat öffnen',exact:true})).toBeVisible({timeout:30000});
  report.tauri_ipc=await page.evaluate(()=>typeof window.__TAURI_INTERNALS__?.invoke==='function');if(!report.tauri_ipc)throw Error('Tauri IPC missing');
  report.phase='configure';const status=await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('neural_status'));
  if(status.keys.openai||status.keys.groq)throw Error('Runner must not contain real/existing provider keys');
  const prefs=status.preferences;prefs.selected='openai';prefs.openai.model='gpt-4.1-mini';prefs.openai.timeout_seconds=5;prefs.openai.retries=0;prefs.privacy.persist_chats=false;
  await page.evaluate(p=>window.__TAURI_INTERNALS__.invoke('neural_settings',{preferences:p}),prefs);
  await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('ai_key_set',{provider:'openai',secret:'JARVIS-CI-LOCAL-DUMMY-NOT-A-REAL-API-KEY'}));dummyStored=true;
  report.phase='open_chat';await page.reload();await page.getByRole('button',{name:'KI-Chat öffnen',exact:true}).click();
  const input=page.getByLabel('Nachricht an J.A.R.V.I.S.',{exact:true});await expect(input).toBeEnabled();await input.fill('Dies ist ein lokaler Windows-UI-Test ohne Cloud-Verbindung.');report.text_input=true;await input.press('Enter');
  const preview=page.getByRole('region',{name:'Versandvorschau',exact:true});await expect(preview).toBeVisible();await expect(preview).toContainText('openai / gpt-4.1-mini');await expect(preview).toContainText('lokaler Windows-UI-Test');report.core_preview=true;
  // Workflow has already installed/verified an outbound firewall rule for this exact exe.
  if(process.env.JARVIS_CI_OUTBOUND_BLOCKED!=='1')throw Error('No certified outbound block: refuse Send');
  report.phase='blocked_send';await page.getByRole('button',{name:'Cloud-Versand bestätigen',exact:true}).click();
  await expect(page.locator('.text-chat').getByRole('alert').filter({hasText:/Netzwerk|Zeitlimit/}).first()).toBeVisible({timeout:20000});
  if(await page.locator('.text-chat .assistant-message').count())throw Error('Unexpected synthetic assistant reply');report.network_error=true;
  report.phase='switch_provider';await page.getByText('Anbieter, Core-Modell & Wissenssuche',{exact:true}).click();await page.getByLabel('KI-Anbieter',{exact:true}).selectOption('groq');await expect(page.locator('.chat-provider')).toContainText('GROQ');report.provider_switch=true;
  await page.screenshot({path:path.join(output,'WINDOWS_CHAT_1.4.2.png')});
  report.phase='voice_panel';await page.getByRole('button',{name:'KI-Chat schließen',exact:true}).click();await page.getByRole('navigation',{name:'Dashboard-Module'}).getByRole('button',{name:/Voice/}).click();await expect(page.getByRole('button',{name:'Stimmen erneut suchen',exact:true})).toBeVisible();await expect(page.getByRole('checkbox',{name:/Ich erlaube das Mikrofon/})).not.toBeChecked();report.voice_panel=true;
  report.phase='complete';
 }finally{
  if(dummyStored&&page){try{await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('ai_key_delete',{provider:'openai'}));const s=await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('neural_status'));report.dummy_key_deleted=!s.keys.openai;}catch{}}
  if(app?.pid){try{execFileSync('taskkill.exe',['/PID',String(app.pid),'/T','/F'],{stdio:'ignore'});}catch{}}
  if(browser)await browser.close().catch(()=>{});
  fs.writeFileSync(path.join(output,'WINDOWS_CHAT_SMOKE.json'),JSON.stringify(report,null,2));
 }
 if(!report.dummy_key_deleted)throw Error('Dummy key cleanup not verified');console.log(JSON.stringify(report));
})().catch(error=>{console.error('Native Windows chat verification failed; phase='+report.phase+'; type='+(['Error','TimeoutError','AssertionError'].includes(error.name)?error.name:'Error'));process.exitCode=1;});
