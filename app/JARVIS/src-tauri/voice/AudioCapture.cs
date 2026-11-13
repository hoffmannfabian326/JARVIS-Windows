// Windows WinMM -> bounded, ephemeral 16-kHz PCM stream. No files or network.
using System;
using System.IO;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;

namespace JarvisVoice {
    internal sealed class VoiceFailure : Exception { public VoiceFailure(string message):base(message) { } }
    internal sealed class AudioCapture : Stream {
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct Caps {
            public ushort Mid, Pid; public uint Version;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string Name;
            public uint Formats; public ushort Channels, Reserved;
        }
        [StructLayout(LayoutKind.Sequential, Pack = 2)]
        private struct Format {
            public ushort Tag, Channels; public uint Samples, Bytes;
            public ushort Align, Bits, Extra;
        }
        [StructLayout(LayoutKind.Sequential)]
        private struct Header {
            public IntPtr Data; public uint Length, Recorded; public UIntPtr User;
            public uint Flags, Loops; public IntPtr Next; public UIntPtr Reserved;
        }
        private delegate void Callback(IntPtr wave, uint message, IntPtr instance, IntPtr parameter, IntPtr unused);
        [DllImport("winmm.dll")] private static extern uint waveInGetNumDevs();
        [DllImport("winmm.dll",CharSet=CharSet.Unicode)] private static extern uint waveInGetDevCapsW(UIntPtr device, out Caps caps, uint size);
        [DllImport("winmm.dll")] private static extern uint waveInOpen(out IntPtr wave, uint device, ref Format format, Callback callback, IntPtr instance, uint flags);
        [DllImport("winmm.dll")] private static extern uint waveInPrepareHeader(IntPtr wave, IntPtr header, uint size);
        [DllImport("winmm.dll")] private static extern uint waveInUnprepareHeader(IntPtr wave, IntPtr header, uint size);
        [DllImport("winmm.dll")] private static extern uint waveInAddBuffer(IntPtr wave, IntPtr header, uint size);
        [DllImport("winmm.dll")] private static extern uint waveInStart(IntPtr wave);
        [DllImport("winmm.dll")] private static extern uint waveInStop(IntPtr wave);
        [DllImport("winmm.dll")] private static extern uint waveInReset(IntPtr wave);
        [DllImport("winmm.dll")] private static extern uint waveInClose(IntPtr wave);
        private sealed class Buffer { public IntPtr Data, Header; public bool Prepared; }
        private readonly List<Buffer> buffers = new List<Buffer>();
        private readonly BlockingCollection<byte[]> queue = new BlockingCollection<byte[]>(16);
        private readonly ConcurrentQueue<IntPtr> returned = new ConcurrentQueue<IntPtr>();
        private readonly AutoResetEvent bufferReady = new AutoResetEvent(false);
        private Thread pump;
        private readonly Callback callback;
        private readonly uint headerSize = (uint)Marshal.SizeOf(typeof(Header));
        private IntPtr handle;
        private int stopping, callbacks, started;
        private string failure;
        private byte[] current; private int offset;
        public AudioCapture(string selected) {
            callback = Receive;
            uint device = UInt32.MaxValue;
            uint count = waveInGetNumDevs();
            if (count == 0) throw new VoiceFailure("Kein Eingabemikrofon vorhanden.");
            if (!String.IsNullOrEmpty(selected)) {
                bool found = false;
                for (uint i = 0; i < count; i++) {
                    Caps caps;
                    if (waveInGetDevCapsW(new UIntPtr(i),out caps,(uint)Marshal.SizeOf(typeof(Caps))) == 0 && selected == i.ToString(System.Globalization.CultureInfo.InvariantCulture) + ":" + caps.Name) { device = i; found = true; break; }
                }
                if (!found) throw new VoiceFailure("Gewaehltes Mikrofon wurde getrennt oder geaendert.");
            }
            var format = new Format { Tag=1, Channels=1, Samples=16000, Bytes=32000, Align=2, Bits=16, Extra=0 };
            try {
                Check(waveInOpen(out handle,device,ref format,callback,IntPtr.Zero,0x30000));
                for (int i = 0; i < 4; i++) {
                    var b = new Buffer(); buffers.Add(b);
                    b.Data = Marshal.AllocHGlobal(3200); b.Header = Marshal.AllocHGlobal((int)headerSize);
                    Marshal.StructureToPtr(new Header { Data=b.Data, Length=3200 },b.Header,false);
                    Check(waveInPrepareHeader(handle,b.Header,headerSize)); b.Prepared = true;
                    Check(waveInAddBuffer(handle,b.Header,headerSize));
                }
                pump = new Thread(Requeue); pump.IsBackground = true; pump.Start();
            } catch { Dispose(); throw; }
        }
        // Opening/preparing a device is not permission to stream before ASR is ready.
        public void Start() {
            if (Thread.VolatileRead(ref stopping) != 0) throw new ObjectDisposedException("AudioCapture");
            if (Interlocked.CompareExchange(ref started,1,0) == 0) Check(waveInStart(handle));
        }
        private static void Check(uint result) {
            if (result != 0) throw new VoiceFailure("Mikrofon nicht verfuegbar. Geraet, Belegung, 16-kHz-PCM-Unterstuetzung und Windows-Mikrofonrechte pruefen (WinMM " + result + ").");
        }
        private void Receive(IntPtr wave, uint message, IntPtr instance, IntPtr parameter, IntPtr unused) {
            if (message != 0x3C0) return; // WIM_DATA
            Interlocked.Increment(ref callbacks);
            try {
                if (Thread.VolatileRead(ref stopping) != 0) return;
                Header h = (Header)Marshal.PtrToStructure(parameter,typeof(Header));
                if (h.Recorded > 3200) { failure="Ungueltiger Audiopuffer."; return; }
                if (h.Recorded > 0) {
                    var data = new byte[h.Recorded]; Marshal.Copy(h.Data,data,0,data.Length);
                    if (!queue.TryAdd(data)) { failure="Audioverarbeitung ueberlastet. Aufnahme erneut starten."; return; }
                }
                // WinMM APIs must not be called from a waveInProc callback.
                returned.Enqueue(parameter); bufferReady.Set();
            } catch { failure="Lokaler Audiokanal wurde unterbrochen."; }
            finally { Interlocked.Decrement(ref callbacks); }
        }
        private void Requeue() {
            while (Thread.VolatileRead(ref stopping) == 0) {
                bufferReady.WaitOne(100);
                IntPtr header;
                while (Thread.VolatileRead(ref stopping) == 0 && returned.TryDequeue(out header)) {
                    if (failure == null && waveInAddBuffer(handle,header,headerSize) != 0) failure="Mikrofon wurde getrennt oder ist nicht mehr verfuegbar.";
                }
            }
        }
        public override int Read(byte[] destination,int start,int count) {
            if (count == 0) return 0;
            if (failure != null) throw new IOException(failure);
            if (Thread.VolatileRead(ref stopping) != 0) return 0;
            if (current == null || offset == current.Length) {
                if (!queue.TryTake(out current,3000)) {
                    if (Thread.VolatileRead(ref stopping) != 0) return 0;
                    throw new IOException("Keine Audiodaten mehr. Mikrofonverbindung pruefen.");
                }
                offset=0;
            }
            int length=Math.Min(count,current.Length-offset);
            Array.Copy(current,offset,destination,start,length);offset+=length;return length;
        }
        protected override void Dispose(bool disposing) {
            if (Interlocked.Exchange(ref stopping,1) != 0) return;
            bufferReady.Set();
            if (pump != null && !pump.Join(1000)) {
                if (handle != IntPtr.Zero) waveInReset(handle);
                if (!pump.Join(1000)) throw new VoiceFailure("Audiotreiber beendet seinen Pufferkanal nicht. Sprachhost wird beendet.");
            }
            if (handle != IntPtr.Zero) {
                waveInStop(handle); waveInReset(handle);
                foreach (var b in buffers) if (b.Prepared) waveInUnprepareHeader(handle,b.Header,headerSize);
                // Never free native buffers if a broken driver still owns the handle.
                if (waveInClose(handle) != 0) throw new VoiceFailure("Mikrofon konnte nicht geschlossen werden. Sprachhost wird beendet.");
                handle=IntPtr.Zero;
            }
            // Reset/close return queued native buffers. Let an in-flight callback exit.
            while (Thread.VolatileRead(ref callbacks) != 0) Thread.Sleep(1);
            foreach (var b in buffers) { if (b.Header != IntPtr.Zero) Marshal.FreeHGlobal(b.Header); if (b.Data != IntPtr.Zero) Marshal.FreeHGlobal(b.Data); }
            byte[] discarded; while(queue.TryTake(out discarded)) { }
            queue.TryAdd(new byte[0]);
            bufferReady.Dispose();
            // Keep the collection object valid for an ASR thread finishing a Read.
            base.Dispose(disposing);
            GC.KeepAlive(callback);
        }
        public override bool CanRead { get { return true; } }
        public override bool CanSeek { get { return false; } }
        public override bool CanWrite { get { return false; } }
        public override long Length { get { throw new NotSupportedException(); } }
        public override long Position { get { throw new NotSupportedException(); } set { throw new NotSupportedException(); } }
        public override void Flush() { }
        public override long Seek(long value,SeekOrigin origin) { throw new NotSupportedException(); }
        public override void SetLength(long value) { throw new NotSupportedException(); }
        public override void Write(byte[] buffer,int offset,int count) { throw new NotSupportedException(); }
    }
}
