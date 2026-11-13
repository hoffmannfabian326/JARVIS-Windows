import {useEffect,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import type {VoiceCapabilities} from './useVoice';
import {safeError} from './useNeural';
// Only voice IDs are persisted by Rust. Microphone consent is never restored.
export function useVoiceCatalog(){
 const [capabilities,setCapabilities]=useState<VoiceCapabilities|null>(null),[voice,setVoiceValue]=useState('');
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[storage,setStorage]=useState('');
 const alive=useRef(false),epoch=useRef(0),selection=useRef<string|null>(null),saveEpoch=useRef(0),writes=useRef(Promise.resolve());
 async function refresh(){
  const ticket=++epoch.current;setLoading(true);setError('');
  try{
   const [result,saved]=await Promise.all([invoke<VoiceCapabilities>('voice_capabilities'),selection.current===null?invoke<string|null>('voice_selection_get').catch(()=>{if(alive.current)setStorage('Gespeicherte Stimme konnte nicht gelesen werden. Bitte erneut auswählen.');return null;}):Promise.resolve(null)]);
   if(!alive.current||ticket!==epoch.current)return;
   setCapabilities(result);
   if(result.tts_error){setError('Stimmen konnten nicht geladen werden. '+result.tts_error);return;}
   const enabled=result.voices.filter(v=>v.enabled!==false),german=enabled.filter(v=>v.culture==='de-DE');
   const next=selection.current??saved??(german.find(v=>v.gender==='Male')??german[0]??enabled[0])?.id??'';
   selection.current=next;setVoiceValue(next);
   if(next&&!enabled.some(v=>v.id===next))setStorage('Gespeicherte Stimme ist derzeit nicht verfügbar. Bitte erneut auswählen.');
  }catch(reason){if(alive.current&&ticket===epoch.current){setCapabilities(null);setError('Stimmen konnten nicht geladen werden. '+safeError(reason));}}
  finally{if(alive.current&&ticket===epoch.current)setLoading(false);}
 }
 async function setVoice(value:string){
  selection.current=value;setVoiceValue(value);const ticket=++saveEpoch.current;setStorage('Stimmenauswahl wird gespeichert …');
  const write=writes.current.then(()=>invoke('voice_selection_set',{voiceId:value}));writes.current=write.then(()=>{},()=>{});
  try{await write;if(alive.current&&ticket===saveEpoch.current)setStorage('Stimmenauswahl gespeichert.');}
  catch{if(alive.current&&ticket===saveEpoch.current)setStorage('Stimmenauswahl konnte nicht gespeichert werden. Bitte erneut auswählen.');}
 }
 useEffect(()=>{alive.current=true;const timer=setTimeout(()=>void refresh(),0);return()=>{alive.current=false;epoch.current++;clearTimeout(timer);};},[]);
 const selectedAvailable=!!capabilities&&!capabilities.tts_error&&capabilities.voices.some(v=>v.id===voice&&v.enabled!==false);
 return {capabilities,voice,setVoice,refresh,loading,error,storage,selectedAvailable};
}
