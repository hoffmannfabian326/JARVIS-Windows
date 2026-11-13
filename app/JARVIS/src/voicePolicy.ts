export type RearmPolicy = { permission:boolean; wake:boolean; working:boolean; busy:boolean; visible:boolean; focused:boolean };
export function mayRearm(p:RearmPolicy) { return p.permission && p.wake && !p.working && !p.busy && p.visible && p.focused; }
export function cleanCommand(text:string) { return text.trim().toLocaleLowerCase('de-DE').replace(/^javis[\s,]+/u,'').replace(/^cloud[\s-]+versand/u,'cloudversand').replace(/[.!?]+$/u,'').trim(); }
export function voiceConfirmation(text:string) {
  const command=cleanCommand(text);
  if (command==='abbrechen'||command==='stopp') return 'cancel';
  if (command==='aktion bestätigen') return 'action';
  if (command==='cloudversand bestätigen') return 'cloud';
  if (command==='cloudversand mit dokumenten bestätigen') return 'documents';
  if (command==='cloudversand mit dokumenten und ausweichanbieter bestätigen') return 'documents-fallback';
  if (command==='cloudversand mit ausweichanbieter bestätigen') return 'fallback';
  return null;
}
export function realLevel(value:unknown) { return typeof value==='number' && Number.isFinite(value) && value>=0 && value<=100 ? value : null; }
