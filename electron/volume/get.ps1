# Liest die aktuelle Systemlautstärke über die offizielle CoreAudio-Schnittstelle.
# Ausgabe: eine ganze Zahl zwischen 0 und 100.

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

namespace Jarvis {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
  internal class MMDeviceEnumeratorComObject { }

  [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  internal interface IMMDeviceEnumerator {
    int NotImpl1();
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
  }

  [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  internal interface IMMDevice {
    int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object instance);
  }

  [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  internal interface IAudioEndpointVolume {
    int NotImpl1();
    int NotImpl2();
    int NotImpl3();
    int NotImpl4();
    int NotImpl5();
    int NotImpl6();
    int GetMasterVolumeLevelScalar(out float level);
  }

  public static class Volume {
    public static float GetScalar() {
      var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
      IMMDevice device;
      int hr = enumerator.GetDefaultAudioEndpoint(0, 1, out device);
      if (hr != 0) throw new COMException("Audio-Endpunkt nicht verfügbar", hr);

      Guid iid = typeof(IAudioEndpointVolume).GUID;
      object raw;
      hr = device.Activate(ref iid, 23, IntPtr.Zero, out raw);
      if (hr != 0) throw new COMException("Lautstärke-Schnittstelle nicht verfügbar", hr);

      float level;
      hr = ((IAudioEndpointVolume)raw).GetMasterVolumeLevelScalar(out level);
      if (hr != 0) throw new COMException("Lautstärke konnte nicht gelesen werden", hr);
      return level;
    }
  }
}
"@

$scalar = [Jarvis.Volume]::GetScalar()
Write-Output ([Math]::Round([Math]::Max(0, [Math]::Min(1, $scalar)) * 100))
