import {useEffect,useRef,useState,type FormEvent} from 'react';
import {MessageSquare,Send,Square,X} from 'lucide-react';
import {NeuralReview,NeuralSelector} from './NeuralConsole';
import {useNeural,safeError,type AiReply,type ChatTurn} from './useNeural';
type Message={id:number;role:'user'|'assistant';text:string;state:'pending'|'complete'|'failed'|'cancelled';local_context:boolean;reply?:AiReply};
type Props={open:boolean;ready:boolean;blockingError?:string;abortSignal:number;onClose:()=>void;onSettings:()=>void;beforeRequest:()=>Promise<void>;onReply:(text:string)=>Promise<unknown>;onPreferencesChanged:()=>void};
const errors:Record<string,string>={auth:'API-Schlüssel',permission:'API-Berechtigung',quota:'Guthaben / Kontingent',rate_limit:'Anfragelimit',model:'Core-Modell',network:'Netzwerk',timeout:'Zeitlimit',server:'Anbieterfehler',http:'API-Fehler',configuration:'Konfiguration',cancelled:'Abgebrochen'};
function historyOf(messages:Message[]):ChatTurn[]{
 const complete=messages.filter(m=>m.state==='complete');const result:ChatTurn[]=[];let chars=0;
 // Keep complete exchanges; never transfer a dangling assistant turn or failed request.
 for(let i=complete.length-2;i>=0;i-=2){const pair=complete.slice(i,i+2);const size=pair.reduce((sum,m)=>sum+m.text.length,0);if(pair.some(m=>[...m.text].length>8000)||result.length+2>20||chars+size>24000)break;result.unshift(...pair.map(m=>({role:m.role,content:m.text,local_context:m.local_context})));chars+=size;}
 return result;
}
export function ChatPanel(props:Props){
 // Same provider hook and Rust commands as Voice; isolate only view/request ownership.
 const neural=useNeural();const [draft,setDraft]=useState(''),[messages,setMessages]=useState<Message[]>([]),[failure,setFailure]=useState<{code:string;message:string}|null>(null),[notice,setNotice]=useState('');
 const epoch=useRef(0),busy=useRef(false),active=useRef(true),next=useRef(0),pendingUser=useRef<number|null>(null),input=useRef<HTMLTextAreaElement>(null),log=useRef<HTMLDivElement>(null);
 const latest=useRef({neural,props});latest.current={neural,props};
 function cancel(){epoch.current++;busy.current=false;latest.current.neural.cancel();const id=pendingUser.current;pendingUser.current=null;if(id!==null)setMessages(rows=>rows.map(m=>m.id===id?{...m,state:'cancelled'}:m));}
 const cancelRef=useRef(cancel);cancelRef.current=cancel;
 useEffect(()=>{active.current=true;return()=>{active.current=false;epoch.current++;};},[]);
 useEffect(()=>{if(props.open)void neural.refresh();else cancelRef.current();},[props.open]);
 useEffect(()=>{cancelRef.current();},[props.abortSignal]);
 useEffect(()=>{if(props.open&&props.ready)input.current?.focus();},[props.open,props.ready]);
 const signature=JSON.stringify(neural.status?.preferences);
 useEffect(()=>{if(signature)latest.current.props.onPreferencesChanged();},[signature]);
 useEffect(()=>{if(!neural.preview||neural.sending)return;const timer=setTimeout(()=>{cancelRef.current();setNotice('Versandvorschau abgelaufen. Bitte erneut vorbereiten.');},120000);return()=>clearTimeout(timer);},[neural.preview,neural.sending]);
 useEffect(()=>{log.current?.scrollTo({top:log.current.scrollHeight});},[messages,neural.sending]);
 useEffect(()=>{if(!props.open)return;const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){cancelRef.current();latest.current.props.onClose();}};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[props.open]);
 const prefs=neural.status?.preferences,provider=prefs?.selected,config=provider?prefs?.[provider]:null;
 const configured=!!provider&&!!neural.status?.keys[provider]&&!!config?.model;
 async function prepare(event:FormEvent){
  event.preventDefault();if(busy.current||!configured||!draft.trim()||!props.ready)return;
  if([...draft].length>8000){setFailure({code:'configuration',message:'Maximal 8.000 Zeichen pro Nachricht.'});return;}
  busy.current=true;const ticket=++epoch.current;setFailure(null);setNotice('');
  try{await props.beforeRequest();if(ticket!==epoch.current)return;await neural.prepare(draft.trim(),historyOf(messages));}
  catch(e){if(ticket===epoch.current)setFailure({code:'configuration',message:safeError(e)});}
  finally{if(ticket===epoch.current)busy.current=false;}
 }
 async function confirm(documents:boolean,fallback:boolean){
  const preview=neural.preview;if(busy.current||!preview)return;busy.current=true;const ticket=++epoch.current;const id=++next.current;
  const local_context=preview.preview.sources.length>0||!!preview.preview.history?.some(m=>m.local_context);
  pendingUser.current=id;setFailure(null);setNotice('');setMessages(rows=>[...rows.slice(-98),{id,role:'user',text:preview.preview.question,state:'pending',local_context}]);
  try{
   const reply=await neural.send(documents,fallback);if(!active.current||ticket!==epoch.current)return;
   pendingUser.current=null;setMessages(rows=>[...rows.map(m=>m.id===id?{...m,state:'complete' as const}:m),{id:++next.current,role:'assistant',text:reply.text,state:'complete',local_context,reply}]);setDraft('');
   void props.onReply(reply.text).catch(()=>{});
  }catch(e){if(active.current&&ticket===epoch.current){pendingUser.current=null;setMessages(rows=>rows.map(m=>m.id===id?{...m,state:safeError(e)==='Anfrage abgebrochen.'?'cancelled':'failed'}:m));const code=safeError(e)==='Anfrage abgebrochen.'?'cancelled':e&&typeof e==='object'&&'code' in e?String(e.code):'configuration';setFailure({code,message:safeError(e)});}}
  finally{if(active.current&&ticket===epoch.current){busy.current=false;input.current?.focus();}}
 }
 if(!props.open)return null;
 return <aside className="text-chat" id="text-chat-panel" aria-label="KI-Chat">
  <header className="text-chat-header"><div><span className="section-kicker">NEURAL TEXT INTERFACE</span><h2><MessageSquare size={18}/> KI-Chat</h2></div><button className="icon-button" aria-label="KI-Chat schließen" onClick={()=>{cancel();props.onClose();}}><X size={18}/></button></header>
  <div className="text-chat-body">
   <p className="chat-provider">{provider?.toUpperCase()??'Nicht verfügbar'} / {config?.model||'Kein Core-Modell ausgewählt'}</p>
   <details className="chat-config"><summary>Anbieter, Core-Modell & Wissenssuche</summary><NeuralSelector neural={neural}/></details>
   {!configured&&<p className="notice">Sicheren API-Schlüssel und Core-Modell in den Einstellungen einrichten. <button onClick={()=>{cancel();props.onSettings();}}>Einstellungen öffnen</button></p>}
   {!props.ready&&(props.blockingError?<p role="alert" className="voice-error">{props.blockingError}</p>:<p role="status">Sprachsitzung wird sicher angehalten …</p>)}
   <div className="text-chat-log" role="log" aria-label="Chatverlauf" aria-live="polite" ref={log}>
    {!messages.length&&<p className="chat-empty">Stelle deine Frage als Text. Antworten erscheinen erst nach einer tatsächlichen Backend-Antwort.</p>}
    {messages.map(m=><article key={m.id} className={m.role==='assistant'?'assistant-message':'user-message'}><small>{m.role==='user'?'DU':'J.A.R.V.I.S.'}</small><p>{m.text}</p>{m.state==='failed'&&<small>Versand fehlgeschlagen · nicht als Kontext übernommen</small>}{m.state==='cancelled'&&<small>Abgebrochen · nicht als Kontext übernommen</small>}{m.reply&&<><small>{m.reply.provider} / {m.reply.model}{m.reply.fallback_used?' · freigegebener Ausweichanbieter':''}</small><small>{m.reply.sources.length?'Lokaler Kontext · Modellbelege prüfen':'KI-Modellwissen · keine aktuelle Webrecherche'}</small>{m.reply.storage_warning&&<p role="alert">{m.reply.storage_warning}</p>}{m.reply.sources.map(source=><details key={source.label}><summary>[{source.label}] {source.source||source.title}</summary><p>{source.text}</p><small>Zeichen {source.start_char+1}–{source.end_char} · Stand {source.updated}</small></details>)}</>}</article>)}
   </div>
   {(neural.preparing||neural.sending)&&<p role="status">{neural.sending?'KI-Anfrage wird verarbeitet …':'Lokale Versandvorschau wird erstellt …'}</p>}
   {neural.preview&&<NeuralReview key={neural.preview.preview.id} neural={neural} onConfirm={(docs,fallback)=>void confirm(docs,fallback)}/>}
   {(failure||neural.error)&&<p role="alert" className="voice-error">{failure?`${errors[failure.code]??'Chat-Fehler'}: ${failure.message}`:neural.error}</p>}
   {notice&&<p role="status">{notice}</p>}
  </div>
  <form className="text-chat-form" onSubmit={e=>void prepare(e)}>
   <label htmlFor="text-chat-message">Nachricht an J.A.R.V.I.S.</label><textarea id="text-chat-message" ref={input} rows={3} maxLength={8000} value={draft} disabled={!props.ready||neural.sending} onChange={e=>{if(neural.preview||neural.preparing||busy.current)cancel();setDraft(e.target.value);}} placeholder="Deine Frage …" onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();e.currentTarget.form?.requestSubmit();}}}/>
   <div className="text-chat-actions"><button aria-label="Versandvorschau erstellen" disabled={!draft.trim()||!configured||!props.ready||neural.preparing||neural.sending}><Send size={15}/> Vorschau</button><button type="button" disabled={!neural.preparing&&!neural.sending&&!neural.preview} onClick={()=>{cancel();setNotice('Anfrage abgebrochen.');}}><Square size={13}/> Abbrechen</button><button type="button" disabled={neural.sending} onClick={()=>{cancel();setMessages([]);setFailure(null);void neural.refresh();setNotice('Sitzungsverlauf geleert. Bereits bewusst gespeicherte Chats bleiben im lokalen Gedächtnis.');}}>Sitzung leeren</button></div>
   <p className="panel-note">Enter: Vorschau · Umschalt+Enter: neue Zeile. Jede Cloud-Anfrage wird bestätigt; API-Kosten sind möglich. Bis zu 20 vorherige Nachrichten / 24.000 Zeichen stehen in der Vorschau. {prefs?.privacy.persist_chats?'Dauerhafte Text-Chat-Speicherung ist aktiviert (Datenschutz-Einstellungen).':'Dieser Textverlauf bleibt nur in der aktuellen App-Sitzung.'}</p>
  </form>
 </aside>;
}
