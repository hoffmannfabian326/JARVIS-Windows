import type { AutonomousVoice } from './useAutonomousVoice';
export function VoiceSettings({engine}:{engine:AutonomousVoice}) {
 return <section className="voice-settings-panel" aria-label="Lokale deutsche Voice Engine">
  <div className="section-kicker">WINDOWS · LOKAL · SYSTEM.SPEECH</div><h2>Deine Stimme. Deine Kontrolle.</h2>
  <p>„Javis“ wird lokal über eine begrenzte Windows-Sprachgrammatik erkannt. Die Erkennungsqualität hängt von Sprachpaket, Mikrofon und Umgebung ab. Es gibt keine Qualitätsgarantie für ein spezialisiertes Wake-Word-Modell.</p>
  <label>Mikrofon<select aria-label="Eingabemikrofon" value={engine.device} onChange={e=>void engine.setDevice(e.target.value)}><option value="">Windows-Standardmikrofon</option>{engine.devices.devices.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
  <p className="panel-note">{engine.devices.devices.length} Eingabegeräte erkannt. Standardgerät: {engine.devices.devices.find(d=>d.id===engine.devices.default_id)?.name??'Nicht ermittelbar'}. Gerätewechsel stoppt die Aufnahme und erfordert eine neue Freigabe.</p>
  <label className="voice-check"><input type="checkbox" checked={engine.permission} disabled={engine.permissionPending||!engine.capabilities?.recognition||!engine.devices.devices.length} onChange={e=>void engine.allow(e.target.checked)}/>Ich erlaube das Mikrofon ausdrücklich für diese Sitzung. Audio bleibt lokal.</label>
  <label className="voice-check"><input type="checkbox" checked={engine.wakeEnabled} disabled={!engine.permission} onChange={e=>void engine.toggleWake(e.target.checked)}/>Lokale Wake-Word-Erkennung für „Javis“ aktivieren</label>
  <p className="panel-note">Nur im aktiven App-Fenster. Während KI-Verarbeitung und Sprachausgabe ist das Mikrofon geschlossen. Escape oder „Mikrofon aus“ beendet die Freigabe. Keine Audio-Dateien, keine Audio-Cloud und kein automatisches Einschalten beim nächsten Start.</p>
  <div className="neural-two"><label>Konfidenzschwelle: {engine.confidence.toFixed(2)}<input aria-label="Wake-Word-Konfidenzschwelle" type="range" min="0.5" max="0.95" step="0.05" value={engine.confidence} disabled={engine.running} onChange={e=>engine.setConfidence(Number(e.target.value))}/><small>Höher = strengere Annahme. Keine gemessene Trefferquote.</small></label>
  <label>Sprechpause: {(engine.silence/1000).toFixed(1)} s<input aria-label="Sprechpause" type="range" min="800" max="3000" step="100" value={engine.silence} disabled={engine.running} onChange={e=>engine.setSilence(Number(e.target.value))}/></label></div>
  <h3>Ruhige deutsche Sprachausgabe</h3>
  <label>Installierte Windows-Stimme<select aria-label="Deutsche Windows-Stimme" value={engine.voice} disabled={engine.running||!engine.capabilities} onChange={e=>void engine.setVoice(e.target.value)}><option value="">Keine Stimme ausgewählt</option>{engine.voice&&!engine.capabilities?.voices.some(v=>v.id===engine.voice)&&<option value={engine.voice}>{engine.voice} · nicht verfügbar</option>}{engine.capabilities?.voices.map(v=><option key={v.id} value={v.id} disabled={v.enabled===false}>{v.name} · {v.culture} · {v.enabled===false?'nicht verfügbar · ':''}{v.gender==='Male'?'männlich':v.gender==='Female'?'weiblich':v.gender}</option>)}</select></label>
  <label className="voice-check"><input type="checkbox" checked={engine.ttsEnabled} disabled={!engine.voiceCatalog.selectedAvailable||engine.running} onChange={e=>engine.setTtsEnabled(e.target.checked)}/>Antworten lokal vorlesen</label>
  <div className="neural-two"><label>Lautstärke: {engine.volume} %<input aria-label="Sprachlautstärke" type="range" min="0" max="100" value={engine.volume} onChange={e=>engine.setVolume(Number(e.target.value))}/></label><label>Sprechgeschwindigkeit: {engine.rate}<input aria-label="Sprechgeschwindigkeit" type="range" min="-10" max="10" value={engine.rate} disabled={engine.running} onChange={e=>engine.setRate(Number(e.target.value))}/></label></div>
  <p>Männliche Stimmen werden bevorzugt, wenn installiert. Tiefe und Natürlichkeit hängen von den verfügbaren Desktop-Stimmen ab. OneCore-Stimmen sind nicht automatisch mit System.Speech kompatibel.</p>
  <button disabled={!engine.voiceCatalog.selectedAvailable||engine.running} onClick={()=>void engine.testVoice()}>Stimme testen</button>
  <button disabled={engine.voiceCatalog.loading||engine.running} onClick={()=>void engine.voiceCatalog.refresh()}>Stimmen erneut suchen</button>
  {engine.voiceCatalog.loading&&<p role="status">Stimmen werden geladen …</p>}
  {engine.voiceCatalog.error&&<p role="alert">{engine.voiceCatalog.error}</p>}
  {!engine.voiceCatalog.loading&&!engine.voiceCatalog.error&&engine.capabilities?.voices.length===0&&<p role="status">Windows meldet keine installierten Desktop-Stimmen.</p>}
  {engine.voiceCatalog.storage&&<p role={engine.voiceCatalog.storage.includes('nicht')?'alert':'status'}>{engine.voiceCatalog.storage}</p>}
  {engine.testStatus&&<p role="status">{engine.testStatus}</p>}
  <p className="panel-note">{engine.capabilities?.host_architecture?`Sprachhost: ${engine.capabilities.host_architecture} · System.Speech`:''} Die Auswahl wird lokal gespeichert. Mikrofonfreigaben bleiben ausgeschaltet.</p>
  <button className="danger-button" onClick={()=>void engine.disable()}>Mikrofon vollständig deaktivieren</button>
  <p className="panel-note">{engine.capabilities?.note??'Sprachhost wird geprüft oder ist nicht verfügbar.'}</p>
  {(!engine.capabilities?.recognition||!engine.devices.devices.length)&&<p role="status" className="notice">Sprachaktivierung derzeit nicht verfügbar. Nutze die per Tastatur erreichbaren Systemaktionen unter Tools, die Wissenssuche und Einstellungen.</p>}
  {engine.error&&<p role="alert" className="voice-error">{engine.error}</p>}
 </section>;
}
