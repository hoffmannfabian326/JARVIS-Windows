# Setzt die Systemlautstärke auf einen festen Prozentwert (0-100).
#
# Windows bietet dafür keinen Kommandozeilenbefehl; die Lautstärke hängt an der
# CoreAudio-Schnittstelle. Der Umweg über die Tastatur (keybd_event) kann nur
# schrittweise lauter/leiser und kennt den Ausgangswert nicht — deshalb hier
# die offizielle Schnittstelle IAudioEndpointVolume.

param([Parameter(Mandatory = $true)][int]$Percent)

$ErrorActionPreference = 'Stop'
$level = [Math]::Max(0, [Math]::Min(100, $Percent))

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
    int SetMasterVolumeLevelScalar(float level, Guid eventContext);
  }

  public static class Volume {
    public static int Set(int percent) {
      var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
      IMMDevice device;
      int hr = enumerator.GetDefaultAudioEndpoint(0, 1, out device); // eRender, eMultimedia
      if (hr != 0) return hr;

      Guid iid = typeof(IAudioEndpointVolume).GUID;
      object raw;
      hr = device.Activate(ref iid, 23, IntPtr.Zero, out raw); // CLSCTX_ALL
      if (hr != 0) return hr;

      var volume = (IAudioEndpointVolume)raw;
      float scalar = Math.Max(0f, Math.Min(1f, percent / 100f));
      return volume.SetMasterVolumeLevelScalar(scalar, Guid.Empty);
    }
  }
}
"@

$result = [Jarvis.Volume]::Set($level)
if ($result -ne 0) {
  throw "Lautstärke ließ sich nicht setzen (HRESULT $result)."
}
Write-Output "Lautstärke: $level Prozent"
