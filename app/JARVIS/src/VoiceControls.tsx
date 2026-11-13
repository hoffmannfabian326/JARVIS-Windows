import { Mic, Square, Volume2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { VoiceEngine } from './useVoice';
export function VoiceControls({ engine }: { engine: VoiceEngine }) {
  const held = useRef(false);
  useEffect(() => {
    const release = () => { held.current = false; };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') release(); };
    window.addEventListener('blur', release); window.addEventListener('keydown', escape);
    return () => { window.removeEventListener('blur', release); window.removeEventListener('keydown', escape); };
  }, []);
  const begin = () => { if (!held.current) { held.current = true; void engine.startListening(); } };
  const finish = () => { if (held.current) { held.current = false; void engine.finish(); } };
  const status = engine.snapshot?.state;
  const label = engine.recording ? 'Aufnahme läuft · Loslassen beendet' : status === 'finishing' ? 'Erkennung wird abgeschlossen …' : engine.running ? status === 'speaking' ? 'Sprachausgabe läuft' : 'Sprachengine startet …' : 'Bereit für Push-to-Talk';
  return <section className="voice-controls" aria-label="Lokale deutsche Voice Engine">
    <div className="voice-control-heading"><Mic size={15}/><strong>VOICE ENGINE / DE-DE</strong><span>LOKAL</span></div>
    <label className="voice-check"><input type="checkbox" checked={engine.permission} disabled={engine.permissionPending || !engine.capabilities?.recognition} onChange={event => { held.current = false; void engine.allowMicrophone(event.target.checked); }}/><span>Ich erlaube das Mikrofon für diese Sitzung. Audio bleibt lokal.</span></label>
    {!engine.capabilities?.recognition && <p className="panel-note">{engine.capabilities === null ? 'Sprachengine wird geprüft oder ist nicht verfügbar.' : 'Kein lokaler de-DE-Erkenner verfügbar. Deutsche Desktop-Spracherkennung installieren.'}</p>}
    <div className="ptt-row"><button className={`ptt-button ${engine.recording ? 'recording' : ''}`} disabled={!engine.permission || engine.permissionPending || !engine.capabilities?.recognition || (engine.running && engine.snapshot?.mode === 'speak')} aria-label="Push-to-Talk: Zum Sprechen halten" aria-describedby="ptt-help"
      onPointerDown={event => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); begin(); }} onPointerUp={finish} onPointerCancel={() => { held.current = false; void engine.cancel(); }}
      onKeyDown={event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); if (!event.repeat) begin(); } }}
      onKeyUp={event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); finish(); } }}
      onBlur={() => { held.current = false; if (engine.running && engine.snapshot?.mode !== 'speak') void engine.cancel(); }}><Mic size={16}/>{engine.recording ? 'Loslassen zum Beenden' : 'Zum Sprechen halten'}</button>
      <button className="voice-stop" aria-label="Sprachaktion abbrechen" disabled={!engine.running} onClick={() => { held.current = false; void engine.cancel(); }}><Square size={14}/></button></div>
    <p id="ptt-help" className="panel-note">Maus oder Leertaste/Enter halten · Escape verwirft · Max. 30 Sekunden. Erkannter Text wird nicht automatisch gesendet.</p>
    <div className="voice-live-state" role="status">{engine.permission || engine.running ? label : 'Mikrofon nicht freigegeben'}{engine.level !== null && <span> · Eingangspegel {engine.level} %</span>}</div>
    {engine.error && <p className="voice-error" role="alert">{engine.error}</p>}
    <details className="voice-settings"><summary><Volume2 size={14}/> Stimme & Sprachausgabe</summary>
      <label className="voice-check"><input type="checkbox" checked={engine.ttsEnabled} disabled={!engine.voice} onChange={event => engine.setTtsEnabled(event.target.checked)}/><span>KI-Antworten lokal vorlesen</span></label>
      <label className="voice-field">Deutsche Windows-Stimme<select aria-label="Deutsche Windows-Stimme" value={engine.voice} onChange={event => engine.setVoice(event.target.value)} disabled={!engine.capabilities?.voices.length}><option value="">Keine Stimme ausgewählt</option>{engine.capabilities?.voices.map(voice => <option key={voice.id} value={voice.id}>{voice.name} · {voice.gender === 'Male' ? 'männlich' : voice.gender === 'Female' ? 'weiblich' : voice.gender}</option>)}</select></label>
      <label className="voice-field">Lautstärke: {engine.volume} %<input aria-label="Sprachlautstärke" type="range" min="0" max="100" value={engine.volume} onChange={event => engine.setVolume(Number(event.target.value))}/></label>
      <label className="voice-field">Sprechgeschwindigkeit: {engine.rate}<input aria-label="Sprechgeschwindigkeit" type="range" min="-10" max="10" value={engine.rate} onChange={event => engine.setRate(Number(event.target.value))}/></label>
      <p className="panel-note">Männliche Stimme wird bevorzugt, falls installiert. Ruhiges Tempo: −2. Tiefe und Klang hängen von der vorhandenen Stimme ab; keine Cloud-Stimme und kein künstlich garantierter „JARVIS“-Klang.</p>
      <button className="secondary-button" disabled={!engine.voice || engine.running} onClick={() => void engine.startSpeaking('Guten Tag. Dies ist die lokale deutsche Sprachausgabe von J.A.R.V.I.S.')}><Volume2 size={13}/> Stimme testen</button>
      <p className="panel-note">{engine.capabilities?.note ?? 'Windows PowerShell 5.1 und System.Speech erforderlich.'}</p>
    </details>
  </section>;
}
