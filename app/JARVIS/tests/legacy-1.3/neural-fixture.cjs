// Test-only responses. No credentials, provider calls or actual stored personal data.
module.exports.installNeural = async function(page) {
 await page.addInitScript(()=>{
  const config=provider=>({provider,model:`test-${provider}-model`,timeout_seconds:45,retries:0});
  window.__neuralTest={calls:[],prefs:{selected:'groq',groq:config('groq'),openai:config('openai'),privacy:{memory_enabled:true,persist_chats:false,document_cloud:false}},keys:{groq:true,openai:true},entries:[],source:false,preview:null};
  window.__neuralInvoke=async(command,args)=>{
   const t=window.__neuralTest;t.calls.push({command,args});
   const base=window.__voiceTest||window.__hudTest||{};
   if(command==='neural_status')return {preferences:t.prefs,keys:t.keys,vault_available:true,stats:{entries:t.entries.length,documents:t.entries.filter(e=>e.source).length,chunks:t.entries.length,database_bytes:40960,chats:0}};
   if(command==='neural_settings'){t.prefs=args.preferences;return;}
   if(command==='ai_models')return [`test-${args.provider}-model`,'test-new-live-model'];
   if(command==='ai_key_set'){t.keys[args.provider]=true;return;}
   if(command==='ai_key_delete'){t.keys[args.provider]=false;return;}
   if(command==='ai_test')throw {code:'permission',message:'HTTP 403: TEST Modellberechtigung fehlt.'};
   if(command==='ai_prepare'){
    t.preview={id:'test-preview',primary:t.prefs[args.request.provider],fallback:args.request.fallback?t.prefs[args.request.fallback]:null,question:args.request.question,sources:t.source&&args.request.use_knowledge?[{label:'S1',entry_id:1,title:'TEST Guide',source:'guide.md',start_char:0,end_char:20,text:'UNTRUSTED TEST DOC',updated:'2026-11-09'}]:[]};
    return {preview:t.preview,messages:[{role:'user',content:args.request.question}]};
   }
   if(command==='ai_send'){
    if(t.sendDelay)await new Promise(resolve=>setTimeout(resolve,t.sendDelay));
    if(base.chatDelay)await new Promise(r=>setTimeout(r,base.chatDelay));
    if(base.failChat)throw Error(base===window.__hudTest?'TEST chat failed':'TEST chat failed');
    return {text:window.__hudTest?'<b>TEST reply</b>':'TEST KI-Antwort',provider:t.preview.primary.provider,model:'test-reported-model',sources:t.preview.sources,fallback_used:false};
   }
   if(command==='ai_cancel'){t.cancelled=true;return;}
   if(command==='memory_list')return t.entries;
   if(command==='memory_save'){const row={...args.entry,id:args.entry.id||t.entries.length+1,updated:'2026-11-09T12:00:00Z'};t.entries=t.entries.filter(e=>e.id!==row.id).concat([row]);return row.id;}
   if(command==='document_import'){t.entries.push({id:1,title:args.name,body:'TEST import',source:args.name,category:args.category,metadata:args.metadata,updated:'2026-11-09'});return 1;}
   if(command==='memory_delete'){t.entries=t.entries.filter(e=>e.id!==args.id);return;}
   if(command==='memory_clear'){t.entries=[];return;}
   if(command==='memory_chats')return [];
   if(command==='memory_export')return JSON.stringify({schema_version:1,entries:t.entries});
   throw Error('Unexpected neural command');
  };
 });
};
