// Executes the real AudioCapture implementation with ONLY its WinMM boundary replaced.
// All PCM bytes are synthetic; this is not a microphone or speech-recognition test.
using System;
using System.Reflection;
using System.Runtime.InteropServices;
namespace JarvisVoice {
 public static class AudioCaptureContract {
  [DllImport("jarvis_wave_test.dll")] private static extern uint test_starts();
  [DllImport("jarvis_wave_test.dll")] private static extern uint test_closes();
  [DllImport("jarvis_wave_test.dll")] private static extern uint test_device();
  [DllImport("jarvis_wave_test.dll")] private static extern void test_reset(uint devices);
  [DllImport("jarvis_wave_test.dll")] private static extern void test_frame();
  private static void Require(bool value,string message){if(!value)throw new Exception(message);}
  public static int Main(){
   try {
    test_reset(1);
    using(var capture=new AudioCapture(null)){
     Require(test_starts()==0,"REGRESSION: capture started before recognizer readiness");
     MethodInfo start=typeof(AudioCapture).GetMethod("Start");Require(start!=null,"Missing explicit readiness start");
     start.Invoke(capture,null);start.Invoke(capture,null);Require(test_starts()==1,"Start must be idempotent");
     Require(test_device()==UInt32.MaxValue,"Default must use Windows mapper");
     test_frame();var bytes=new byte[4];Require(capture.Read(bytes,0,4)==4&&bytes[0]==17&&bytes[1]==34&&bytes[2]==51&&bytes[3]==68,"Native callback PCM must reach stream unchanged");
    }
    Require(test_closes()==1,"Device must close exactly once");
    test_reset(1);var cancelled=new AudioCapture("0:TEST");Require(test_device()==0,"Explicit device must be used");cancelled.Dispose();
    try{typeof(AudioCapture).GetMethod("Start").Invoke(cancelled,null);throw new Exception("Disposed capture was restarted");}catch(TargetInvocationException e){Require(e.InnerException is ObjectDisposedException,"Disposed start must fail closed");}
    Require(test_starts()==0,"Cancelled setup must never start audio");
    test_reset(1);try{using(var invalid=new AudioCapture("0:OTHER")){}throw new Exception("Missing device silently fell back");}catch(VoiceFailure){}
    Require(test_starts()==0,"Missing explicit microphone must not start another device");
    test_reset(0);try{using(var missing=new AudioCapture(null)){}throw new Exception("Missing microphone accepted");}catch(VoiceFailure){}
    Console.WriteLine("PASS: deferred/idempotent capture, PCM stream, exact device, no fallback, cancel/dispose, no microphone");return 0;
   }catch(Exception e){Console.Error.WriteLine(e.Message);return 1;}
  }
 }
}
