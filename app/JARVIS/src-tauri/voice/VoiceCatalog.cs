// C# 5 / System.Speech desktop voices. No registry edits, audio or network in discovery.
using System;
using System.Collections.Generic;
using System.Speech.Synthesis;
namespace JarvisVoice {
 public sealed class VoiceDescriptor {
  public string id, name, gender, culture;
  public bool enabled;
 }
 public static class VoiceCatalog {
  public static List<VoiceDescriptor> Read(SpeechSynthesizer synth) {
   var result=new List<VoiceDescriptor>();
   foreach(InstalledVoice installed in synth.GetInstalledVoices()) {
    VoiceInfo info=installed.VoiceInfo;
    result.Add(new VoiceDescriptor {id=info.Name,name=info.Name,gender=info.Gender.ToString(),culture=info.Culture.Name,enabled=installed.Enabled});
   }
   return result;
  }
  public static bool CanSpeak(IEnumerable<VoiceDescriptor> voices,string selected) {
   foreach(var voice in voices) if(voice.enabled && String.Equals(voice.id,selected,StringComparison.Ordinal))return true;
   return false;
  }
 }
}
