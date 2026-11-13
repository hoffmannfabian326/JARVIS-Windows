// C# 5 / .NET Framework: compatible with Windows PowerShell 5.1 Add-Type.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Speech.Recognition;
using System.Speech.AudioFormat;
using System.Speech.Synthesis;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

namespace JarvisVoice {
    public static class Host {
        private static readonly object OutputLock = new object();
        private static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
        private static void Emit(object value) {
            lock (OutputLock) { Console.WriteLine(Json.Serialize(value)); Console.Out.Flush(); }
        }
        private static RecognizerInfo GermanRecognizer() {
            foreach (RecognizerInfo info in SpeechRecognitionEngine.InstalledRecognizers())
                if (info.Culture.Name == "de-DE") return info;
            return null;
        }
        public static void Run(string request) {
            try {
                var data = Json.Deserialize<Dictionary<string, object>>(request);
                string mode = (string)data["mode"];
                if (mode == "probe") {
                    var voices = new List<VoiceDescriptor>();
                    bool recognition = false;
                    string ttsError = null, ttsCode = null, ttsHresult = null;
                    try { using (var synth = new SpeechSynthesizer()) { voices = VoiceCatalog.Read(synth); } }
                    catch (Exception error) { ttsError = "Windows-Stimmen konnten nicht gelesen werden. Erneut suchen und Sprachdiagnose pruefen."; ttsCode="VOICE_ENUMERATION_FAILED"; ttsHresult=error.HResult.ToString("X8",CultureInfo.InvariantCulture); }
                    try { recognition = GermanRecognizer() != null; } catch (Exception) { }
                    Emit(new { type = "capabilities", available = true, voices = voices, recognition = recognition, tts_error=ttsError, tts_code=ttsCode, tts_hresult=ttsHresult, host_architecture=Environment.Is64BitProcess?"x64":"x86", protocol_version=2, note = "Lokales System.Speech. Desktop-Mikrofonzugriff und de-DE-Erkenner werden getrennt von TTS geprueft." });
                } else if (mode == "listen" || mode == "wake") Listen(data, mode == "wake");
                else if (mode == "speak") Speak(data);
                else throw new ArgumentException();
            } catch (VoiceFailure failure) { Emit(new { type="error",error=failure.Message });
            } catch (Exception) {
                Emit(new { type = "error", error = "Lokale Sprachengine nicht verfuegbar. Installierte deutsche Desktop-Sprachpakete, Mikrofonrechte und Audiogeraet pruefen." });
            }
        }
        private static void Speak(Dictionary<string, object> data) {
            using (var synth = new SpeechSynthesizer()) {
                string selected = (string)data["voice"];
                if (!VoiceCatalog.CanSpeak(VoiceCatalog.Read(synth),selected)) throw new VoiceFailure("Gewaehlte Windows-Stimme ist nicht verfuegbar oder deaktiviert. Stimmen erneut suchen.");
                synth.SelectVoice(selected);
                synth.Volume = Convert.ToInt32(data["volume"], CultureInfo.InvariantCulture);
                synth.Rate = Convert.ToInt32(data["rate"], CultureInfo.InvariantCulture);
                synth.SetOutputToDefaultAudioDevice();
                // Plain text, never SSML/code supplied by a chat response.
                using (var done = new ManualResetEvent(false)) {
                    bool failed = false;
                    synth.SpeakCompleted += delegate(object sender, SpeakCompletedEventArgs e) { failed = e.Error != null; done.Set(); };
                    synth.SpeakStarted += delegate { Emit(new { type = "speaking" }); };
                    synth.SpeakAsync((string)data["text"]);
                    if (!done.WaitOne(TimeSpan.FromMinutes(3))) {
                        synth.SpeakAsyncCancelAll();
                        Emit(new { type = "error", error = "Sprachausgabe nach drei Minuten beendet." });
                    } else if (failed) Emit(new { type = "error", error = "Lokale Sprachausgabe fehlgeschlagen." });
                    else Emit(new { type = "complete", transcript = "" });
                }
            }
        }
        private static void Listen(Dictionary<string, object> data, bool wakeMode) {
            RecognizerInfo info = GermanRecognizer();
            if (info == null) throw new VoiceFailure("Kein lokaler de-DE-Spracherkenner installiert. Deutsche Desktop-Spracherkennung in Windows einrichten.");
            string device = data.ContainsKey("device_id") ? data["device_id"] as string : null;
            double confidence = data.ContainsKey("confidence") && data["confidence"] != null ? Convert.ToDouble(data["confidence"],CultureInfo.InvariantCulture) : 0.7;
            int silence = data.ContainsKey("silence_ms") && data["silence_ms"] != null ? Convert.ToInt32(data["silence_ms"],CultureInfo.InvariantCulture) : 1600;
            if (confidence < 0.5 || confidence > 0.95 || silence < 800 || silence > 3000) throw new ArgumentException();
            Task<string> control = Task.Factory.StartNew(delegate { return Console.ReadLine(); });
            // A cancelled start never opens a capture device.
            if (control.IsCompleted) { Emit(new { type="complete", transcript="" }); return; }
            using (var capture = new AudioCapture(device))
            using (var recognizer = new SpeechRecognitionEngine(info))
            using (var done = new ManualResetEvent(false)) {
                var gate = new object();
                bool armed = wakeMode, finished = false, failed = false;
                string transcript = "";
                var clock = new Stopwatch();
                long commandStarted = 0, quietSince = 0;
                bool speech = false;
                var dictation = new DictationGrammar { Name="command", Enabled=!wakeMode };
                recognizer.LoadGrammar(dictation);
                Grammar wake = null, combined = null;
                if (wakeMode) {
                    var word = new GrammarBuilder { Culture=new CultureInfo("de-DE") }; word.Append(new Choices("Javis"));
                    wake = new Grammar(word) { Name="wake" }; recognizer.LoadGrammar(wake);
                    var phrase = new GrammarBuilder { Culture=new CultureInfo("de-DE") }; phrase.Append("Javis"); phrase.AppendDictation();
                    combined = new Grammar(phrase) { Name="wake-command" }; recognizer.LoadGrammar(combined);
                }
                recognizer.EndSilenceTimeout=TimeSpan.FromMilliseconds(silence);
                recognizer.EndSilenceTimeoutAmbiguous=TimeSpan.FromMilliseconds(silence);
                recognizer.RecognizerUpdateReached += delegate {
                    lock(gate) {
                        if (!armed && !finished) {
                            if (wake != null) wake.Enabled=false;
                            if (combined != null) combined.Enabled=false;
                            dictation.Enabled=true;
                            Emit(new { type="listening" });
                        }
                    }
                };
                recognizer.SpeechRecognized += delegate(object sender,SpeechRecognizedEventArgs e) {
                    lock(gate) {
                        if (finished) return;
                        if (armed) {
                            string recognized=e.Result.Text;
                            if (e.Result.Confidence < confidence) return;
                            bool onlyWord=e.Result.Grammar.Name=="wake" && String.Equals(recognized,"Javis",StringComparison.OrdinalIgnoreCase);
                            bool wholeCommand=e.Result.Grammar.Name=="wake-command" && recognized.StartsWith("Javis ",StringComparison.OrdinalIgnoreCase);
                            if (!onlyWord && !wholeCommand) return;
                            armed=false; commandStarted=clock.ElapsedMilliseconds;quietSince=commandStarted;
                            Emit(new { type="activated" });
                            if (wholeCommand) {
                                transcript=recognized.Substring(5).TrimStart(' ', ',');
                                if (transcript.Length>8000) { failed=true;transcript=""; }
                                finished=true;
                            } else recognizer.RequestRecognizerUpdate();
                        } else if(e.Result.Grammar.Name=="command") {
                            string next=(transcript+" "+e.Result.Text).Trim();
                            if(next.Length>8000) { failed=true;finished=true; } else transcript=next;
                        }
                    }
                };
                recognizer.AudioStateChanged += delegate(object sender,AudioStateChangedEventArgs e) {
                    lock(gate) { speech=e.AudioState==AudioState.Speech;quietSince=clock.ElapsedMilliseconds; }
                };
                var levelClock=Stopwatch.StartNew();
                recognizer.AudioLevelUpdated += delegate(object sender,AudioLevelUpdatedEventArgs e) {
                    if(levelClock.ElapsedMilliseconds>=80) { Emit(new { type="level",level=e.AudioLevel });levelClock.Restart(); }
                };
                recognizer.RecognizeCompleted += delegate(object sender,RecognizeCompletedEventArgs e) { failed=failed || e.Error!=null;done.Set(); };
                recognizer.SetInputToAudioStream(capture,new SpeechAudioFormatInfo(16000,AudioBitsPerSample.Sixteen,AudioChannel.Mono));
                try {
                    if(control.IsCompleted) { Emit(new { type="complete",transcript="" });return; }
                    clock.Start();
                    capture.Start();
                    recognizer.RecognizeAsync(RecognizeMode.Multiple);
                    Emit(new { type=wakeMode?"armed":"listening" });
                    while(!control.IsCompleted && !done.WaitOne(40)) {
                        lock(gate) {
                            long now=clock.ElapsedMilliseconds;
                            if(finished || (armed && now>=300000) || (!armed && (now-commandStarted>=30000 || (!speech && transcript.Length>0 && now-quietSince>=silence) || (transcript.Length==0 && now-commandStarted>=8000 && !speech)))) break;
                        }
                    }
                    if(!done.WaitOne(0)) {
                        recognizer.RecognizeAsyncStop();
                        if(!done.WaitOne(2000)) { recognizer.RecognizeAsyncCancel(); capture.Dispose(); if(!done.WaitOne(1000)) failed=true; }
                    }
                } finally { capture.Dispose(); recognizer.SetInputToNull(); }
                if(failed) Emit(new { type="error",error="Lokale Spracherkennung oder Audiokanal fehlgeschlagen. Mikrofon, Rechte und Sprachpaket pruefen." });
                else { lock(gate) Emit(new { type="complete",transcript=transcript }); }
            }
        }
    }
}
