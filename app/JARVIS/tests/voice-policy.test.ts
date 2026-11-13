import test from 'node:test';
import assert from 'node:assert/strict';
import { mayRearm,realLevel,voiceConfirmation } from '../src/voicePolicy.ts';
const ready={permission:true,wake:true,working:false,busy:false,visible:true,focused:true};
test('wake may resume only with all privacy and lifecycle conditions',()=>{assert.equal(mayRearm(ready),true);for(const denied of [{permission:false},{wake:false},{working:true},{busy:true},{visible:false},{focused:false}])assert.equal(mayRearm({...ready,...denied}),false);});
test('cloud, document and fallback consent are distinct exact spoken commands',()=>{assert.equal(voiceConfirmation('Javis, Cloud-Versand bestätigen.'),'cloud');assert.equal(voiceConfirmation('Cloudversand mit Dokumenten bestätigen'),'documents');assert.equal(voiceConfirmation('Cloudversand mit Dokumenten und Ausweichanbieter bestätigen'),'documents-fallback');assert.equal(voiceConfirmation('ja'),null);assert.equal(voiceConfirmation('Ich zitiere Aktion bestätigen'),null);assert.equal(voiceConfirmation('Aktion bestätigen'),'action');assert.equal(voiceConfirmation('stopp'),'cancel');});
test('audio level is native bounded input, never synthesized from states or text',()=>{assert.equal(realLevel(0),0);assert.equal(realLevel(67),67);for(const bad of [null,undefined,'67',101,-1,NaN,Infinity])assert.equal(realLevel(bad),null);});
