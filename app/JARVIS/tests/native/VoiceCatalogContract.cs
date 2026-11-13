using System;
using System.Collections.Generic;
using System.Speech.Synthesis;
using System.Web.Script.Serialization;
namespace JarvisVoice {
 public static class VoiceCatalogContract {
  private static void Require(bool value,string message){if(!value)throw new Exception(message);}
  public static int Main(){try{
   var voices=new List<VoiceDescriptor>{new VoiceDescriptor{id="Microsoft Hedda Desktop",name="Microsoft Hedda Desktop",culture="de-DE",gender="Female",enabled=true},new VoiceDescriptor{id="Microsoft Zira Desktop",name="Microsoft Zira Desktop",culture="en-US",gender="Female",enabled=true},new VoiceDescriptor{id="TEST disabled",name="TEST disabled",culture="de-DE",gender="Male",enabled=false}};
   var serializer=new JavaScriptSerializer();var roundtrip=serializer.Deserialize<List<VoiceDescriptor>>(serializer.Serialize(voices));
   Require(roundtrip.Count==3&&roundtrip[0].culture=="de-DE"&&roundtrip[1].culture=="en-US","JSON cultures lost");
   Require(VoiceCatalog.CanSpeak(roundtrip,"Microsoft Hedda Desktop"),"Hedda must remain selectable");Require(VoiceCatalog.CanSpeak(roundtrip,"Microsoft Zira Desktop"),"English voice lost");Require(!VoiceCatalog.CanSpeak(roundtrip,"TEST disabled"),"Disabled voice accepted");Require(!VoiceCatalog.CanSpeak(roundtrip,"not installed"),"Unknown voice accepted");Require(!VoiceCatalog.CanSpeak(new List<VoiceDescriptor>(),"x"),"Empty catalog accepted");
   bool rendered=false;int count=0;
   using(var synth=new SpeechSynthesizer()){
    var installed=VoiceCatalog.Read(synth);count=installed.Count;
    Require(count==synth.GetInstalledVoices().Count,"Production discovery differs from real Windows inventory");
    foreach(var voice in installed)if(voice.enabled){synth.SelectVoice(voice.id);synth.SetOutputToNull();synth.Speak("Dies ist ein lokaler technischer Test ohne Lautsprecherausgabe.");rendered=true;break;}
   }
   Console.WriteLine("PASS: voice catalog JSON, de-DE/en-US, availability; real installed count="+count+"; TTS rendered to null="+rendered+"; NO audible or microphone test");return 0;
  }catch(Exception e){Console.Error.WriteLine("Voice catalog contract failed: "+e.GetType().Name);return 1;}}
 }
}
