import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
export type Provider = 'openai' | 'groq';
export type ProviderConfig = { provider: Provider; model: string; timeout_seconds: number; retries: number };
export type Privacy = { memory_enabled: boolean; persist_chats: boolean; document_cloud: boolean };
export type Preferences = { privacy: Privacy; openai: ProviderConfig; groq: ProviderConfig; selected: Provider };
export type MemoryEntry = { id: number; title: string; body: string; category: string; source: string; metadata: Record<string,string>; updated: string };
export type Source = { label: string; entry_id: number; title: string; source: string; start_char: number; end_char: number; text: string; updated: string; metadata?:Record<string,string> };
export type Preview = { utterance?:string; preview: { id: string; primary: ProviderConfig; fallback: ProviderConfig | null; question: string; sources: Source[] }; messages: {role:string;content:string}[] };
export type AiReply = {text:string;provider:Provider;model:string;sources:Source[];fallback_used:boolean;storage_warning?:string|null};
export type NeuralStatus = { preferences: Preferences; keys: Record<Provider,boolean>; vault_available:boolean; stats: {entries:number;documents:number;chunks:number;database_bytes:number;chats:number} };
export const safeError = (reason: unknown) => typeof reason === 'string' ? reason : reason && typeof reason === 'object' && 'message' in reason ? String(reason.message) : 'Lokale Operation fehlgeschlagen.';
export function useNeural() {
  const [status,setStatus]=useState<NeuralStatus|null>(null);
  const [error,setError]=useState('');
  const [preview,setPreview]=useState<Preview|null>(null);
  const [preparing,setPreparing]=useState(false);
  const [useKnowledge,setUseKnowledge]=useState(true);
  const [fallback,setFallback]=useState<Provider|''>('');
  const [sending,setSending]=useState(false);
  const epoch=useRef(0);
  const pending=useRef<string|null>(null);
  async function refresh(){try{setStatus(await invoke<NeuralStatus>('neural_status'));setError('');}catch(e){setError(safeError(e));}}
  useEffect(()=>{const timer=setTimeout(()=>void refresh(),0);return()=>{clearTimeout(timer);epoch.current++;if(pending.current)void invoke('ai_cancel',{requestId:pending.current}).catch(()=>{});};},[]);
  async function settings(preferences:Preferences){cancel();await invoke('neural_settings',{preferences});setPreview(null);await refresh();}
  async function prepare(question:string){
    if(!status)return;const current=++epoch.current;setPreparing(true);setError('');setPreview(null);
    try{const result=await invoke<Preview>('ai_prepare',{request:{question,provider:status.preferences.selected,use_knowledge:useKnowledge,fallback:fallback||null}});if(current===epoch.current){pending.current=result.preview.id;setPreview(result);}else void invoke('ai_cancel',{requestId:result.preview.id});}
    catch(e){if(current===epoch.current)setError(safeError(e));}finally{if(current===epoch.current)setPreparing(false);}
  }
  async function prepareVoice(planId:string):Promise<Preview|null>{
    if(!status)return null;cancel();const current=++epoch.current;setPreparing(true);setError('');
    try{const result=await invoke<Preview>('assistant_cloud_prepare',{planId,provider:status.preferences.selected,useKnowledge,fallback:fallback||null});if(current===epoch.current){pending.current=result.preview.id;setPreview(result);return result;}else void invoke('ai_cancel',{requestId:result.preview.id});}
    catch(e){if(current===epoch.current)setError(safeError(e));throw e;}finally{if(current===epoch.current)setPreparing(false);}return null;
  }
  async function send(documentConsent:boolean,fallbackConsent:boolean,voiceOnly=false):Promise<AiReply>{
    if(!preview)throw Error('Bitte die Versandvorschau neu erstellen.');
    const current=++epoch.current;const id=preview.preview.id;pending.current=id;setSending(true);setError('');
    try{const reply=await invoke<AiReply>(voiceOnly?'assistant_cloud_send':'ai_send',{requestId:id,documentConsent,fallbackConsent,...(voiceOnly?{confirmed:true}:{})});if(current!==epoch.current)throw Error('Anfrage abgebrochen.');await refresh();if(current!==epoch.current)throw Error('Anfrage abgebrochen.');return reply;}
    catch(e){if(current===epoch.current)setError(safeError(e));throw e;}
    finally{if(current===epoch.current){setSending(false);setPreview(null);pending.current=null;}}
  }
  function cancel(){epoch.current++;const id=pending.current;pending.current=null;setSending(false);setPreparing(false);setPreview(null);if(id)void invoke('ai_cancel',{requestId:id}).catch(()=>setError('Abbruch konnte nicht bestätigt werden.'));}
  return {status,error,preview,preparing,sending,refresh,settings,prepare,prepareVoice,send,cancel,useKnowledge,setUseKnowledge,fallback,setFallback};
}
export type Neural = ReturnType<typeof useNeural>;
