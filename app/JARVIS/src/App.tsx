import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Activity, ArrowUpRight, AudioLines, BookOpen, Check, Cpu, Database, Globe2, HardDrive, Mic, MicOff, Network, Search, Settings2, ShieldCheck, Square, Thermometer, Wrench, X } from 'lucide-react';
import { useBackend } from './useBackend';
import { useNeural, safeError, type Source } from './useNeural';
import { useAutonomousVoice } from './useAutonomousVoice';
import { VoiceSettings } from './VoiceSettings';
import { NeuralConsole, NeuralSelector } from './NeuralConsole';
import { HudCore } from './HudCore';
import { chartSegments, format, ramPercent } from './telemetry';
import { voiceConfirmation } from './voicePolicy';

type Module='knowledge'|'wow'|'news'|'tools'|'voice'|'settings';
type Action={kind:string;metric?:string;module?:Module;value?:number;enabled?:boolean;text?:string};
type Plan={id:string;action:Action;summary:string;confirmation:boolean;origin:'local'|'model'};
type Result={text:string;action?:Action;sources?:Source[];provider?:string;model?:string;origin?:string;storage_warning?:string|null};
type Details={disks:{name:string;total_bytes:number;available_bytes:number}[];networks:{name:string;received_bytes:number;transmitted_bytes:number}[]};
const modules:{id:Module;label:string;icon:typeof BookOpen;code:string}[]=[{id:'knowledge',label:'Wissen',icon:BookOpen,code:'01'},{id:'wow',label:'WoW Forever',icon:Globe2,code:'02'},{id:'news',label:'KI-News',icon:Activity,code:'03'},{id:'tools',label:'Tools',icon:Wrench,code:'04'},{id:'voice',label:'Voice',icon:AudioLines,code:'05'},{id:'settings',label:'Einstellungen',icon:Settings2,code:'06'}];
const labels:Record<string,string>={ready:'Bereit',stopping:'Beendet Aufnahme',armed:'Bereit · „Javis“',starting:'Startet',activated:'Aktiviert',listening:'Hört zu',finishing:'Erkennt',processing:'Verarbeitet',speaking:'Spricht',error:'Fehler'};
function App() {
 const backend=useBackend(),neural=useNeural();
 const [panel,setPanel]=useState<Module|null>(null),[time,setTime]=useState(new Date());
 const [result,setResult]=useState<Result|null>(null),[pending,setPending]=useState<Plan|null>(null);
 const [working,setWorking]=useState(false),[error,setError]=useState(''),[command,setCommand]=useState(''),[showCommand,setShowCommand]=useState(true);
 const [documents,setDocuments]=useState(false),[fallbackConsent,setFallbackConsent]=useState(false),[query,setQuery]=useState('');
 const [details,setDetails]=useState<Details|null>(null);
 const dialog=useRef<HTMLDialogElement>(null),held=useRef(false),epoch=useRef(0),busy=useRef(false),commandTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const commandRef=useRef<(text:string)=>Promise<void>>(async()=>{}),abortRef=useRef<()=>void>(()=>{});
 const voice=useAutonomousVoice(text=>commandRef.current(text),()=>abortRef.current());
 const prefs=neural.status?.preferences,provider=prefs?.selected,config=provider?prefs?.[provider]:null;
 const configured=!!provider&&!!neural.status?.keys[provider]&&!!config?.model;
 const phase=error?'error':voice.phase==='speaking'?'speaking':voice.activated?'activated':working||neural.sending?'processing':voice.phase;
 function abortFlow() {epoch.current++;busy.current=false;setWorking(false);setPending(null);setError('');setCommand('');clearTimeout(commandTimer.current);neural.cancel();void invoke('assistant_cancel').catch(()=>{});}
 abortRef.current=abortFlow;
 useEffect(()=>{const t=setInterval(()=>setTime(new Date()),1000);return()=>clearInterval(t);},[]);
 useEffect(()=>{let active=true;let timer:ReturnType<typeof setTimeout>;const poll=async()=>{try{const data=await invoke<Details>('get_dashboard_details');if(active)setDetails(data);}catch{if(active)setDetails(null);}if(active)timer=setTimeout(()=>void poll(),8000);};const start=setTimeout(()=>void poll(),0);return()=>{active=false;clearTimeout(start);clearTimeout(timer);};},[]);
 useEffect(()=>{const el=dialog.current;if(panel&&!el?.open)el?.showModal();if(!panel&&el?.open)el?.close();},[panel]);
 useEffect(()=>()=>{epoch.current++;clearTimeout(commandTimer.current);neural.cancel();void invoke('assistant_cancel').catch(()=>{});},[]);
 useEffect(()=>{if((!pending&&!neural.preview)||working)return;const timer=setTimeout(()=>{setPending(null);neural.cancel();void invoke('assistant_cancel').catch(()=>{});setResult({text:'Die Freigabe ist abgelaufen. Bitte den Auftrag erneut aktivieren.',origin:'local'});},120000);return()=>clearTimeout(timer);},[pending,neural.preview,working]);
 function openPanel(id:Module){abortFlow();void voice.interrupt();setPanel(id);}
 async function inFlow(task:(ticket:number)=>Promise<void>) {
  if(busy.current)return;busy.current=true;const ticket=++epoch.current;setWorking(true);setError('');
  try{await voice.pause();await task(ticket);}catch(e){if(ticket===epoch.current){setError(safeError(e));setResult({text:safeError(e),origin:'local'});}}
  finally{if(ticket===epoch.current){busy.current=false;setWorking(false);voice.resume();}}
 }
 async function execute(plan:Plan,ticket:number,confirmed:boolean) {
  const next=await invoke<Result>('assistant_run',{planId:plan.id,confirmed});if(ticket!==epoch.current)return;
  setPending(null);setResult(next);
  if(next.action?.kind==='open_module'&&next.action.module)setPanel(next.action.module);
  if(next.action?.kind==='set_volume'&&next.action.value!==undefined)voice.setVolume(next.action.value);
  if(next.action?.kind==='set_speech'){voice.setTtsEnabled(!!next.action.enabled);if(!next.action.enabled)return;}
  if(next.action?.kind==='remember')void neural.refresh();
  await voice.speak(next.text);
 }
 async function confirmAction(){if(pending)await inFlow(ticket=>execute(pending,ticket,true));}
 async function confirmCloud(documentsAllowed:boolean,fallbackAllowed:boolean) {
  if(!neural.preview)return;
  await inFlow(async ticket=>{
   const reply=await neural.send(documentsAllowed,fallbackAllowed,true);if(ticket!==epoch.current)return;
   const interpreted=await invoke<{text:string;plan:Plan|null}>('assistant_model_response',{text:reply.text});if(ticket!==epoch.current)return;
   setResult({...reply,text:interpreted.text,origin:'cloud'});setPending(interpreted.plan);
   if(interpreted.plan)await voice.speak(`${interpreted.plan.summary}. Zur Ausführung: Javis, Aktion bestätigen. Oder abbrechen.`);
   else await voice.speak(interpreted.text);
  });
 }
 async function handleCommand(text:string) {
  const confirmation=voiceConfirmation(text);
  if(confirmation==='cancel'){abortFlow();await voice.interrupt();return;}
  if(confirmation==='action'&&pending){await confirmAction();return;}
  if(confirmation&&['cloud','documents','fallback','documents-fallback'].includes(confirmation)&&neural.preview){await confirmCloud(confirmation.includes('documents'),confirmation.includes('fallback'));return;}
  setPanel(null);
  await inFlow(async ticket=>{
   neural.cancel();setPending(null);setDocuments(false);setFallbackConsent(false);await invoke('assistant_cancel');
   setCommand(text);clearTimeout(commandTimer.current);commandTimer.current=setTimeout(()=>setCommand(''),12000);
   const plan=await invoke<Plan>('assistant_plan',{utterance:text,volume:voice.volume});if(ticket!==epoch.current)return;
   if(plan.action.kind==='cloud_question') {
    if(!configured)throw Error('Kein verwendbarer KI-Anbieter eingerichtet. Sicheren Schlüssel und ein tatsächlich verfügbares Modell in den Einstellungen auswählen.');
    const prepared=await neural.prepareVoice(plan.id);if(ticket!==epoch.current||!prepared)return;
    const p=prepared.preview;
    setResult({text:'Cloud-Freigabe erforderlich. Prüfe Anbieter, Frage und lokale Quellen vor dem Versand.',origin:'local'});
    const permissionPhrase=`Cloudversand${p.sources.length?' mit Dokumenten':''}${p.fallback?(p.sources.length?' und Ausweichanbieter':' mit Ausweichanbieter'):''} bestätigen`;
    await voice.speak(`Ich würde die Frage an ${p.primary.provider}, Modell ${p.primary.model}, senden. ${p.sources.length?`${p.sources.length} lokale Abschnitte aus ${p.sources.map(s=>s.source||s.title).slice(0,3).join(', ')} sind vorgesehen.`:'Keine Dokumentabschnitte.'} API-Kosten und Anbieterbedingungen gelten. Prüfe die Versandvorschau. Zur Einzelfreigabe: Javis, ${permissionPhrase}. Oder abbrechen.`);
   } else if(plan.confirmation) {
    setPending(plan);setResult({text:plan.summary,origin:'local'});await voice.speak(`${plan.summary}. Ich führe das erst nach Ihrer Bestätigung aus. Javis, Aktion bestätigen. Oder abbrechen.`);
   } else await execute(plan,ticket,false);
  });
 }
 commandRef.current=text=>{held.current=false;return handleCommand(text);};
 async function interrupt(){abortFlow();await voice.interrupt();}
 const micLabel=voice.micUncertain?'MIKROFONSTATUS UNBESTÄTIGT':voice.micActive?voice.snapshot?.state==='armed'?'WAKE WORD HÖRT LOKAL':'MIKROFON AKTIV':voice.permission?'MIKROFON GESCHLOSSEN':'MIKROFON AUS';
 const ram=ramPercent(backend.telemetry),cpu=backend.telemetry?.cpu_percent??null;
 const free=details?.disks.reduce((s,d)=>s+d.available_bytes,0),total=details?.disks.reduce((s,d)=>s+d.total_bytes,0);
 const startPtt=()=>{if(!held.current){held.current=true;void voice.listen();}};
 const finishPtt=()=>{if(held.current){held.current=false;void voice.finish();}};
 const canCloudSend=(!neural.preview?.preview.sources.length||documents&&!!prefs?.privacy.document_cloud)&&(!neural.preview?.preview.fallback||fallbackConsent);
 return <div className="autonomous-app">
  <a className="skip-link" href="#main-content">Zum Inhalt</a>
  <header className="topbar"><a className="brand" href="#main-content" aria-label="J.A.R.V.I.S. Hauptdashboard"><span className="brand-symbol" aria-hidden="true"><i/></span><span><strong>J.A.R.V.I.S.</strong><small>AUTONOMOUS VOICE INTERFACE <b>1.4.1</b></small></span></a>
   <div className="top-status"><span className={`status-dot ${backend.telemetry?'valid':''}`}/><span>{backend.telemetry?'SYSTEMABFRAGE ERFOLGREICH':'SYSTEMDATEN NICHT VERFÜGBAR'}</span></div>
   <div className="top-ai"><span>KI-ANBIETER<strong>{provider?.toUpperCase()??'Nicht verfügbar'}</strong></span><span>GEWÄHLTES MODELL<strong>{config?.model||'Nicht ausgewählt'}</strong></span></div>
   <div className="clock"><strong>{time.toLocaleTimeString('de-DE')}</strong><span>{time.toLocaleDateString('de-DE',{day:'2-digit',month:'long',year:'numeric'})}</span></div><button className="icon-button" aria-label="Einstellungen öffnen" onClick={()=>openPanel('settings')}><Settings2 size={20}/></button>
  </header>
  <div className="environment-line"><span><ShieldCheck size={12}/> LOCAL FIRST · KEINE AUDIO-CLOUD</span><span className={voice.micActive?'mic-on':''}><Mic size={12}/>{micLabel}</span><span>VOICE / {voice.capabilities?.recognition?labels[phase]??'Bereit':'DE-DE NICHT VERFÜGBAR'}</span></div>
  <main id="main-content" tabIndex={-1} className="main-grid">
   <aside className="telemetry-column" aria-label="Echte Hardwarewerte"><div className="column-heading"><span>01 / SYSTEM TELEMETRY</span><Activity size={14}/></div>
    <section className="monitor-card"><div className="card-title"><Cpu size={15}/> CPU <span>LIVE-ABFRAGE</span></div><strong className="metric-number">{format(cpu,'%')}</strong><p>{backend.telemetry?.cpu_name??'Nicht verfügbar'}</p><svg className="mini-chart" viewBox="0 0 100 30" preserveAspectRatio="none" aria-label="Verlauf tatsächlich empfangener CPU-Werte">{chartSegments(backend.samples,'cpu').map((points,i)=><polyline key={i} points={points} transform="scale(1 .3)"/>)}</svg><div className="card-bottom"><span>RUST / SYSINFO</span><span>{backend.updated?.toLocaleTimeString('de-DE')??'Kein Messpunkt'}</span></div></section>
    <section className="monitor-card"><div className="card-title"><Activity size={15}/> GPU <span>SENSOR</span></div><strong className="metric-number">{format(backend.telemetry?.gpu_percent,'%')}</strong><p>Kein GPU-Messanbieter integriert</p><div className="empty-signal" aria-hidden="true"/><div className="card-bottom"><span>KEINE SIMULIERTEN WERTE</span></div></section>
    <section className="monitor-card"><div className="card-title"><Database size={15}/> ARBEITSSPEICHER</div><strong className="metric-number">{format(ram,'%')}</strong><div className="meter" role="meter" aria-label="RAM-Auslastung" aria-valuemin={0} aria-valuemax={100} aria-valuenow={ram??undefined} aria-valuetext={ram===null?'Nicht verfügbar':`${ram.toFixed(1)} Prozent`}><i style={{width:ram===null?'0%':`${ram}%`}}/></div><p>{format(backend.telemetry?.ram_used_gb,'GiB')} / {format(backend.telemetry?.ram_total_gb,'GiB')}</p></section>
    <section className="compact-monitor"><div className="card-title"><Thermometer size={15}/> TEMPERATUREN</div><dl><div><dt>CPU</dt><dd>{format(backend.telemetry?.cpu_temp_c,'°C')}</dd></div><div><dt>GPU</dt><dd>{format(backend.telemetry?.gpu_temp_c,'°C')}</dd></div></dl></section>
    <section className="compact-monitor"><div className="card-title"><HardDrive size={15}/> SPEICHER</div><p>{details?.disks.length?`${format((free??0)/1073741824,'GiB')} frei von ${format((total??0)/1073741824,'GiB')}`:'Nicht verfügbar'}</p><div className="card-title"><Network size={15}/> NETZWERK</div><p>{details?.networks.length?`${details.networks.length} erfasste Schnittstellen`:'Nicht verfügbar'}</p><small>Kein Nachweis einer Internetverbindung</small></section>
   </aside>
   <section className="core-column" aria-label="Sprachgesteuerter Assistent"><div className="core-topline"><span>NEURAL INTELLIGENCE CORE</span><span>LOCAL CONTROL / CLOUD ON CONSENT</span></div><HudCore voiceState={phase} level={voice.level}/>
    <div className="core-state" role="status"><span className="status-dot valid"/>{labels[phase]??'Bereit'}{neural.preview||pending?<small>Einzelfreigabe erforderlich</small>:<small>{voice.wakeEnabled?'Aktivierungswort: „Javis“':'Aktivierung ist ausgeschaltet'}</small>}</div>
    {showCommand&&command&&<div className="recognized-command"><span>ERKANNTER AUFTRAG · TEMPORÄR</span><p>{command}</p></div>}
    <div className="voice-deck"><span className={`microphone-orb ${voice.micActive?'active':''}`} aria-hidden="true"><Mic size={26}/></span><div><strong>{voice.micActive?(voice.snapshot?.state==='armed'?'Sag „Javis“.':'Ich höre zu.'):'Dein nächster Auftrag.'}</strong><p>{voice.permission?'Lokale Erkennung · Deutsch · kein Audio-Upload':'Mikrofon ausdrücklich in Voice freigeben.'}</p></div></div>
    <div className="core-actions">{!voice.permission?<button className="primary-button" onClick={()=>openPanel('voice')}><Mic size={16}/> Mikrofon einrichten</button>:<>
     <button className={`primary-button ${voice.micActive?'recording':''}`} disabled={working||voice.snapshot?.mode==='speak'&&voice.running} aria-label="Push-to-Talk: Zum Sprechen halten" onPointerDown={e=>{if(e.button!==0)return;e.currentTarget.setPointerCapture(e.pointerId);startPtt();}} onPointerUp={finishPtt} onPointerCancel={()=>{held.current=false;void interrupt();}} onKeyDown={e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();if(!e.repeat)startPtt();}}} onKeyUp={e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();finishPtt();}}} onBlur={()=>{if(held.current){held.current=false;void interrupt();}}}><Mic size={16}/> Zum Sprechen halten</button>
     <button disabled={working} onClick={()=>void voice.listen()}>Einmal zuhören</button><button aria-pressed={voice.wakeEnabled} disabled={working} onClick={()=>void voice.toggleWake(!voice.wakeEnabled)}>{voice.wakeEnabled?'„Javis“ ausschalten':'„Javis“ aktivieren'}</button></>}
     <button aria-label="Antwort oder Auftrag unterbrechen" onClick={()=>void interrupt()}><Square size={15}/> Unterbrechen</button>
    </div><p className="core-help">Push-to-Talk: Maus, Leertaste oder Enter halten · Escape: Mikrofon vollständig aus</p>
    <div className="core-footer"><span>KEINE ROH-AUDIO-SPEICHERUNG</span><span>KEINE AUTOMATISCHE DIALOGSPEICHERUNG</span></div>
   </section>
   <aside className="context-column" aria-label="Systeminformationen und aktuelle Ergebnisse"><div className="column-heading"><span>02 / CONTEXT & CONTROL</span><ShieldCheck size={14}/></div>
    <section className="context-card"><div className="card-title"><ShieldCheck size={15}/> SYSTEMSTATUS</div><dl><div><dt>Betriebssystem</dt><dd>{backend.telemetry?.os_name??'Nicht verfügbar'}</dd></div><div><dt>KI-Konfiguration</dt><dd>{configured?'Schlüssel & Modell gewählt':'Nicht eingerichtet'}</dd></div><div><dt>Wissenseinträge</dt><dd>{neural.status?.stats.entries??'Nicht verfügbar'}</dd></div><div><dt>Dokumente</dt><dd>{neural.status?.stats.documents??'Nicht verfügbar'}</dd></div><div><dt>SQLite / FTS</dt><dd>{neural.status?format(neural.status.stats.database_bytes/1024,'KiB'):'Nicht verfügbar'}</dd></div></dl><p className="panel-note">Konfiguration bestätigt keine Online-Verbindung.</p></section>
    <section className="context-card result-card" aria-label="Aktuelles Ergebnis"><div className="card-title"><AudioLines size={15}/> AKTUELLER KONTEXT</div>{result?<><p className="result-copy">{result.text}</p><small>{result.provider?`Tatsächlich verwendet: ${result.provider} / ${result.model}`:'Lokale App-Funktion · kein Cloud-Aufruf'}</small>{result.storage_warning&&<p role="alert">{result.storage_warning}</p>}{!!result.sources?.length&&<div className="sources"><strong>{result.provider?'Übermittelter lokaler Kontext · Modellbelege prüfen':'Lokale FTS-Quellen'}</strong>{result.sources.map(s=><details key={s.label}><summary>[{s.label}] {s.source||s.title}</summary><p>{s.text}</p><small>Zeichen {s.start_char+1}–{s.end_char} · Stand {s.updated}</small></details>)}</div>}</>:<div className="quiet-state"><span className="small-reactor" aria-hidden="true"/><h2>Raum für deinen Auftrag.</h2><p>Lokale Systembefehle bleiben lokal. Für Cloud-KI zeige ich dir zuerst, was übertragen würde.</p><button onClick={()=>openPanel('tools')}>Manuelle Steuerung <ArrowUpRight size={13}/></button></div>}</section>
    {pending&&<section className="consent-card" aria-label="Aktionsfreigabe"><span className="section-kicker">{pending.origin==='model'?'KI-VORSCHLAG · KEINE AUSFÜHRUNG':'LOKALE EINZELFREIGABE'}</span><h3>Aktion bestätigen?</h3><p>{pending.summary}</p><p>Sprachfreigabe: „Javis, Aktion bestätigen.“ · 120 Sekunden gültig.</p><button disabled={working} onClick={()=>void confirmAction()}><Check size={14}/> Aktion bestätigen</button><button onClick={()=>void interrupt()}>Abbrechen</button></section>}
    {neural.preview&&<section className="consent-card" aria-label="Cloud-Versandvorschau"><span className="section-kicker">CLOUD-FREIGABE · API-KOSTEN MÖGLICH</span><h3>Vor dem Versand</h3><p>{neural.preview.preview.primary.provider} / {neural.preview.preview.primary.model}</p><p>{neural.preview.utterance??neural.preview.preview.question}</p><details><summary>Alle Informationen, die übertragen würden</summary><pre>{JSON.stringify(neural.preview.messages,null,2)}</pre></details>{neural.preview.preview.sources.map(s=><details key={s.label}><summary>[{s.label}] {s.source||s.title} · Zeichen {s.start_char+1}–{s.end_char}</summary><p>{s.text}</p></details>)}
     {!!neural.preview.preview.sources.length&&<label className="voice-check"><input type="checkbox" checked={documents} onChange={e=>setDocuments(e.target.checked)}/>Diese Dokumentabschnitte zur Cloud-Verarbeitung freigeben</label>}
     {!!neural.preview.preview.sources.length&&!prefs?.privacy.document_cloud&&<p className="voice-error">Dokument-Cloud ist in den Datenschutzeinstellungen gesperrt. Lokales Wissen für diesen Auftrag abwählen oder die Einstellung bewusst ändern.</p>}
     {neural.preview.preview.fallback&&<label className="voice-check"><input type="checkbox" checked={fallbackConsent} onChange={e=>setFallbackConsent(e.target.checked)}/>Weiterleitung an {neural.preview.preview.fallback.provider} ausdrücklich erlauben</label>}
     <p>Es gelten Anbieterbedingungen und mögliche API-Kosten. Kein Audio wird übertragen. 120 Sekunden gültig.</p><button disabled={working||!canCloudSend} onClick={()=>void confirmCloud(documents,fallbackConsent)}><Check size={14}/> Cloud-Versand bestätigen</button><button onClick={()=>void interrupt()}>Abbrechen</button></section>}
    {(error||voice.error||neural.error)&&<p className="voice-error" role="alert">{error||voice.error||neural.error}</p>}
    <button className={`mic-kill ${voice.micActive?'active':''}`} onClick={()=>void voice.disable()}><MicOff size={17}/><span>Mikrofon aus<small>Sofort schließen · Sitzung beenden</small></span></button>
   </aside>
  </main>
  <nav className="module-dock" aria-label="Dashboard-Module">{modules.map(({id,label,icon:Icon,code})=><button key={id} onClick={()=>openPanel(id)} aria-haspopup="dialog"><span>{code}</span><Icon size={20}/><strong>{label}</strong><ArrowUpRight size={12}/></button>)}</nav>
  <footer className="footer-line"><span>J.A.R.V.I.S. / 1.4.0</span><span>KI-NEWS: NICHT VERFÜGBAR · KEINE QUELLE ANGEBUNDEN</span><span>LOKAL GESTEUERT. BEWUSST VERBUNDEN.</span></footer>
  <dialog ref={dialog} className="module-dialog" aria-label={modules.find(m=>m.id===panel)?.label??'Dashboard-Modul'} onCancel={e=>{e.preventDefault();setPanel(null);}}><header><div><span className="section-kicker">COMMAND OVERLAY / {modules.find(m=>m.id===panel)?.code}</span><h2>{modules.find(m=>m.id===panel)?.label}</h2></div><button aria-label="Modul schließen" className="icon-button" onClick={()=>setPanel(null)}><X/></button></header>
   <nav className="overlay-tabs" aria-label="Modulauswahl">{modules.map(m=><button key={m.id} aria-pressed={panel===m.id} onClick={()=>setPanel(m.id)}>{m.label}</button>)}</nav>
   <div className="overlay-body">
    {panel==='voice'&&<><VoiceSettings engine={voice}/><label className="voice-check"><input type="checkbox" checked={showCommand} onChange={e=>setShowCommand(e.target.checked)}/>Erkannten Auftrag zwölf Sekunden anzeigen</label></>}
    {panel==='settings'&&<><NeuralSelector neural={neural}/><NeuralConsole neural={neural} section="settings"/></>}
    {(panel==='knowledge'||panel==='wow')&&<><div className="section-kicker">SQLITE / FTS5 · AUSSCHLIESSLICH LOKALE QUELLEN</div><h2>{panel==='wow'?'Deine Guides. Dein Wissensstand.':'Dein lokales Gedächtnis.'}</h2><p>{panel==='wow'?'Importiere eigene Raid-, Boss- und Klassenguides mit Version und Quelle. Keine erfundenen Serverinformationen.':'Notizen und Dokumente bewusst speichern, durchsuchen, bearbeiten, exportieren und löschen.'}</p><form className="knowledge-search" onSubmit={e=>{e.preventDefault();if(query.trim())void handleCommand(`Suche in meinem lokalen ${panel==='wow'?'WoW-Guides':'Wissen'} nach ${query}`);}}><label htmlFor="knowledge-query">Lokales Wissen durchsuchen</label><div><input id="knowledge-query" value={query} maxLength={300} onChange={e=>setQuery(e.target.value)} placeholder="Raid, Boss, Notiz oder Stichwort"/><button disabled={!query.trim()||working}><Search size={16}/> Suchen</button></div></form><NeuralConsole neural={neural} section="knowledge"/></>}
    {panel==='news'&&<div className="empty-module"><Globe2 size={44}/><h2>Aktuelles braucht eine Quelle.</h2><p>Ein News-Dienst und aktuelle Webrecherche sind nicht angebunden. Hier erscheinen keine erfundenen Schlagzeilen oder Online-Meldungen.</p><span className="notice">KI-News: Nicht verfügbar</span></div>}
    {panel==='tools'&&<><div className="section-kicker">TYPISIERTE RUST-WERKZEUGE</div><h2>Direkt bedienen. Auch ohne Mikrofon.</h2><p>Per Maus, Tab, Enter und Leertaste erreichbar. Es gibt keine freie Shell, beliebige Dateiaktionen oder von der KI erweiterbare Berechtigungen.</p><div className="tool-grid">{[['CPU-Auslastung','Wie hoch ist meine CPU-Auslastung?'],['Arbeitsspeicher','Wie ist mein Arbeitsspeicher?'],['Temperaturen','Zeige meine Temperaturen'],['Speicherplatz','Wie viel Speicherplatz ist frei?'],['KI-Konfiguration','Welches KI-Modell verwendest du?'],['Netzwerkdaten','Zeige Netzwerkdaten']].map(([label,text])=><button key={label} disabled={working} onClick={()=>void handleCommand(text)}><Activity size={18}/>{label}<ArrowUpRight size={13}/></button>)}</div><p className="panel-note">KI-Vorschläge werden separat bestätigt. Neue Erinnerungen und kostenpflichtige Cloud-Anfragen benötigen immer eine Einzelfreigabe. Ohne Mikrofon bleiben manuelle Module, Wissenssuche und Einstellungen verfügbar.</p><button onClick={()=>{abortFlow();setResult(null);void voice.interrupt();}}>Sitzungsanzeige leeren</button><button onClick={backend.refresh}>Systemdaten neu abfragen</button><label className="voice-check"><input type="checkbox" checked={showCommand} onChange={e=>setShowCommand(e.target.checked)}/>Erkannten Auftrag vorübergehend anzeigen</label></>}
   </div></dialog>
 </div>;
}
export default App;
