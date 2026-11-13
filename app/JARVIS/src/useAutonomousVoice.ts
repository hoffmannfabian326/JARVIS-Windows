import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {useVoiceCatalog} from './useVoiceCatalog';
import { mayRearm, realLevel } from './voicePolicy';
import { safeError } from './useNeural';
export type AudioDevices={devices:{id:string;name:string}[];default_id:string|null};
type Mode='wake'|'listen'|'speak';
export type Snapshot={session_id:string;mode:Mode;state:string;level:number|null;transcript:string;error:string|null;activated?:boolean};
const terminal=(s:Snapshot)=>['complete','cancelled','error'].includes(s.state);
export function useAutonomousVoice(onCommand:(text:string)=>Promise<void>,onAbort:()=>void) {
 const [activated,setActivated]=useState(false);
 const [permissionPending,setPermissionPending]=useState(false);const permissionEpoch=useRef(0),desiredPermission=useRef(false);
 const [stopping,setStopping]=useState(false);
 const [micUncertain,setMicUncertain]=useState(false);const uncertain=useRef(false);
 const activationId=useRef(''),activationTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const catalog=useVoiceCatalog();const {capabilities,voice,setVoice}=catalog;
 const [testStatus,setTestStatus]=useState('');
 const [devices,setDevices]=useState<AudioDevices>({devices:[],default_id:null});
 const [permission,setPermission]=useState(false),[wakeEnabled,setWakeEnabled]=useState(false);
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[starting,setStarting]=useState<Mode|null>(null),[error,setError]=useState('');
 const [device,setDeviceValue]=useState(''),[volume,setVolume]=useState(65),[rate,setRate]=useState(-2);
 const [ttsEnabled,setTtsEnabled]=useState(true),[confidence,setConfidence]=useState(.7),[silence,setSilence]=useState(1600);
 const live=useRef(false),allowed=useRef(false),wake=useRef(false),working=useRef(false),busy=useRef(false),generation=useRef(0);
 const session=useRef<string|null>(null),mode=useRef<Mode|null>(null),finishRequested=useRef(false);
 const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),rearmTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const completion=useRef<((success:boolean)=>void)|null>(null);
 const callback=useRef(onCommand),abort=useRef(onAbort);callback.current=onCommand;abort.current=onAbort;
 const options=useRef({device,voice,volume,rate,ttsEnabled,confidence,silence}); options.current={device,voice,volume,rate,ttsEnabled,confidence,silence};
 const recognition=useRef(false);recognition.current=capabilities?.recognition===true;
 const deviceCount=useRef(0);deviceCount.current=devices.devices.length;
 const stateRef=useRef({stop:async()=>true,disable:async(_reason?:string)=>{},start:async(_mode:Mode,_text?:string)=>{},rearm:()=>{}});
 async function stop() {
  const capturePossible=uncertain.current||busy.current&&mode.current!=='speak';
  generation.current++;clearTimeout(timer.current);clearTimeout(rearmTimer.current);
  const id=session.current;session.current=null;busy.current=false;mode.current=null;
  completion.current?.(false);completion.current=null;
  if(live.current){setSnapshot(null);setStarting(null);if(capturePossible)setStopping(true);}
  // An absent ID cancels a start that has not returned yet; Rust invalidates its lease.
  try{await invoke('voice_cancel',{sessionId:id});uncertain.current=false;if(live.current)setMicUncertain(false);return true;}
  catch{if(capturePossible){uncertain.current=true;if(live.current){setMicUncertain(true);setError('Mikrofon-Abbruch nicht bestätigt. Bitte App schließen und den Windows-Mikrofonstatus prüfen.');}}return !capturePossible;}finally{if(live.current)setStopping(false);}
 }
 async function disable(reason='') {
  permissionEpoch.current++;desiredPermission.current=false;if(live.current)setPermissionPending(false);
  allowed.current=false;wake.current=false;working.current=false;
  if(live.current){setPermission(false);setWakeEnabled(false);setActivated(false);clearTimeout(activationTimer.current);if(reason)setError(reason);}
  await stop();try{await invoke('voice_permission',{allowed:false});uncertain.current=false;if(live.current){setMicUncertain(false);setError(reason);}}catch{if(uncertain.current&&live.current)setMicUncertain(true);}abort.current();
 }
 function rearm() {
  clearTimeout(rearmTimer.current);
  if(!live.current)return;
  rearmTimer.current=setTimeout(()=>{
   if(mayRearm({permission:allowed.current,wake:wake.current,working:working.current,busy:busy.current||uncertain.current,visible:!document.hidden,focused:document.hasFocus()})) void stateRef.current.start('wake');
  },900); // cooldown and no recognition during output/processing
 }
 async function poll(id:string,epoch:number) {
  if(!live.current||generation.current!==epoch)return;
  try {
   const next=await invoke<Snapshot>('voice_snapshot',{sessionId:id});
   if(!live.current||generation.current!==epoch)return;
   setSnapshot(next);
   if(next.activated&&activationId.current!==id){activationId.current=id;setActivated(true);clearTimeout(activationTimer.current);activationTimer.current=setTimeout(()=>{if(live.current)setActivated(false);},450);}
   if(!terminal(next)){timer.current=setTimeout(()=>void poll(id,epoch),100);return;}
   // Keep capture ownership until a failed native session has really been stopped.
   if(next.state==='error'){await disable(next.error??'Lokale Sprachaktion fehlgeschlagen.');return;}
   busy.current=false;session.current=null;mode.current=null;
   completion.current?.(next.state==='complete');completion.current=null;
   if(next.state==='cancelled'){wake.current=false;setWakeEnabled(false);return;}
   if(next.mode!=='speak'&&next.transcript.trim()) {
    working.current=true;
    try {await callback.current(next.transcript.trim());}catch(e){if(live.current)setError(safeError(e));}
   } else if(next.mode==='listen'&&!next.transcript.trim())setError('Kein Befehl erkannt. Mikrofon, Rechte und de-DE-Erkenner prüfen oder erneut aktivieren.');
   // App owns the work/speech boundary; only explicitly released work can rearm.
   stateRef.current.rearm();
  } catch {if(live.current&&generation.current===epoch)await disable('Sprachstatus verloren. Das Mikrofon wurde deaktiviert.');}
 }
 async function start(action:Mode,text?:string) {
  if(busy.current||!live.current||uncertain.current)return;
  if(action!=='speak'&&(!allowed.current||!recognition.current||!deviceCount.current))return;
  if(action==='speak'&&(!options.current.voice||!text?.trim()))return;
  busy.current=true;mode.current=action;setStarting(action);setError('');setSnapshot(null);
  const epoch=++generation.current;
  const task=(async()=>{
   try {
    const o=options.current;
    const next=await invoke<Snapshot>('voice_start',{request:{mode:action,text:text?.slice(0,16000),voice:o.voice,volume:o.volume,rate:o.rate,device_id:o.device||null,confidence:o.confidence,silence_ms:o.silence}});
    if(!live.current||epoch!==generation.current){await invoke('voice_cancel',{sessionId:next.session_id}).catch(()=>{});return;}
    session.current=next.session_id;setSnapshot(next);setStarting(null);
    if(action==='listen'&&finishRequested.current)await invoke('voice_finish',{sessionId:next.session_id});
    void poll(next.session_id,epoch);
   } catch(e) {
    if(live.current&&epoch===generation.current){await disable(safeError(e));}
   }
  })();
  await task;
 }
 // Keep callbacks fresh without restarting the inventory / lifecycle effect.
 stateRef.current={stop,disable,start,rearm};
 useEffect(()=>{
  live.current=true;let active=true;let inventoryTimer:ReturnType<typeof setTimeout>;let previous:string|null=null;
  const init=setTimeout(()=>{
   const inventory=async()=>{
    try {const next=await invoke<AudioDevices>('voice_devices');if(!active)return;const fingerprint=JSON.stringify(next);
     if(previous!==null&&previous!==fingerprint&&(allowed.current||desiredPermission.current||busy.current))await stateRef.current.disable('Audio-Geräte oder Standardmikrofon geändert. Bitte Gerät prüfen und erneut freigeben.');
     previous=fingerprint;setDevices(next);
    }catch{if(active&&allowed.current)await stateRef.current.disable('Mikrofonliste nicht erreichbar. Aufnahme gestoppt.');}
    if(active)inventoryTimer=setTimeout(()=>void inventory(),2000);
   };void inventory();
  },0);
  const loseFocus=()=>{if(allowed.current||desiredPermission.current||wake.current)void stateRef.current.disable('Mikrofon beim Verlassen des aktiven Fensters deaktiviert.');};
  const hidden=()=>{if(document.hidden)loseFocus();};
  const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')void stateRef.current.disable();};
  window.addEventListener('blur',loseFocus);window.addEventListener('pagehide',loseFocus);document.addEventListener('visibilitychange',hidden);window.addEventListener('keydown',escape);
  return()=>{active=false;live.current=false;clearTimeout(activationTimer.current);clearTimeout(init);clearTimeout(inventoryTimer);window.removeEventListener('blur',loseFocus);window.removeEventListener('pagehide',loseFocus);document.removeEventListener('visibilitychange',hidden);window.removeEventListener('keydown',escape);allowed.current=false;desiredPermission.current=false;permissionEpoch.current++;wake.current=false;void stateRef.current.stop();void invoke('voice_permission',{allowed:false}).catch(()=>{});};
 },[]);
 async function allow(yes:boolean) {
  if(!yes){await disable();return;}
  if(!recognition.current||!deviceCount.current){setError('Kein verfügbares Mikrofon oder kein lokaler de-DE-Erkenner. Nutze die manuellen Dashboard-Aktionen.');return;}
  const ticket=++permissionEpoch.current;desiredPermission.current=true;setPermissionPending(true);
  try {
   if(uncertain.current&&!await stop())return;
   if(ticket!==permissionEpoch.current)return;
   await invoke('voice_permission',{allowed:true});
   if(!live.current||ticket!==permissionEpoch.current){if(!desiredPermission.current)await invoke('voice_permission',{allowed:false}).catch(()=>{});return;}
   allowed.current=true;setPermission(true);setError('');
  }catch(e){if(live.current&&ticket===permissionEpoch.current){desiredPermission.current=false;setError(safeError(e));}}
  finally{if(live.current&&ticket===permissionEpoch.current)setPermissionPending(false);}
 }
 async function toggleWake(yes:boolean) {if(!yes){wake.current=false;setWakeEnabled(false);await stop();return;}if(!allowed.current)return;wake.current=true;setWakeEnabled(true);working.current=false;rearm();}
 async function listen() {finishRequested.current=false;working.current=true;if(!await stop())return;working.current=false;await start('listen');}
 async function finish() {finishRequested.current=true;if(session.current&&mode.current==='listen')await invoke('voice_finish',{sessionId:session.current}).catch(()=>void disable('Aufnahme konnte nicht abgeschlossen werden.'));}
 async function pause() {working.current=true;if(!await stop())throw Error('Mikrofon-Abbruch nicht bestätigt. Verarbeitung bleibt angehalten.');}
 function resume() {working.current=false;rearm();}
 async function speak(text:string,force=false) {
  if(!live.current||(!options.current.ttsEnabled&&!force)||!catalog.selectedAvailable||!text.trim())return false;
  working.current=true;if(!await stop())return false;
  return await new Promise<boolean>(resolve=>{completion.current=resolve;void start('speak',text);});
 }
 async function testVoice(){setTestStatus('Stimmtest läuft …');const success=await speak('Hallo, ich bin Javis. Dies ist der lokale Windows-Stimmtest.',true);if(live.current){setTestStatus(success?'Sprachhost hat den Stimmtest abgeschlossen. Hörbarkeit bitte selbst prüfen.':'Stimmtest fehlgeschlagen oder abgebrochen.');resume();}}
 async function setDevice(value:string) {await disable();setDeviceValue(value);}
 const micActive=stopping||micUncertain||starting==='listen'||starting==='wake'||!!snapshot&&!terminal(snapshot)&&snapshot.mode!=='speak';
 const phase=micUncertain?'error':stopping?'stopping':starting?'starting':snapshot&&!terminal(snapshot)?snapshot.state:'ready';
 return {permissionPending,micUncertain,activated,capabilities,devices,permission,wakeEnabled,snapshot,starting,error,device,setDevice,voice,setVoice,voiceCatalog:catalog,testVoice,testStatus,volume,setVolume,rate,setRate,ttsEnabled,setTtsEnabled,confidence,setConfidence,silence,setSilence,allow,toggleWake,listen,finish,disable,pause,resume,speak,
  interrupt:async()=>{await stop();working.current=false;rearm();},micActive,phase,running:!!starting||!!snapshot&&!terminal(snapshot),level:micActive?realLevel(snapshot?.level):null};
}
export type AutonomousVoice=ReturnType<typeof useAutonomousVoice>;
