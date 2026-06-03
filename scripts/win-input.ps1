# Persistenter Win32-Helfer für Blitztext (Fokus erfassen + Einfügen).
# Protokoll über stdin/stdout, eine Antwortzeile pro Befehl:
#   capture        -> gibt das HWND des aktuellen Vordergrundfensters zurück
#   paste <hwnd>    -> aktiviert das Fenster und sendet Strg+V, gibt "ok" zurück
$ErrorActionPreference = 'Stop'

$sig = @'
using System;
using System.Runtime.InteropServices;
public class WI {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
}
'@
Add-Type -TypeDefinition $sig

$wsh = New-Object -ComObject WScript.Shell
$VK_MENU = [byte]0x12      # ALT
$KEYUP = [uint32]2
$SW_RESTORE = 9

function Force-Foreground([IntPtr]$h) {
  if ($h -eq [IntPtr]::Zero) { return }
  if ([WI]::IsIconic($h)) { [void][WI]::ShowWindow($h, $SW_RESTORE) }
  # Alt-Tipp entsperrt SetForegroundWindow (Windows-Foreground-Lock-Workaround).
  [WI]::keybd_event($VK_MENU, 0, 0, [UIntPtr]::Zero)
  [WI]::keybd_event($VK_MENU, 0, $KEYUP, [UIntPtr]::Zero)
  [void][WI]::SetForegroundWindow($h)
}

# Signalisiere Bereitschaft.
[Console]::Out.WriteLine('ready')
[Console]::Out.Flush()

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  $line = $line.Trim()
  if ($line -eq '') { continue }
  $parts = $line.Split(' ')
  $cmd = $parts[0]

  try {
    if ($cmd -eq 'capture') {
      $h = [WI]::GetForegroundWindow()
      [Console]::Out.WriteLine([int64]$h)
    }
    elseif ($cmd -eq 'paste') {
      $h = [IntPtr][int64]$parts[1]
      Force-Foreground $h
      Start-Sleep -Milliseconds 60
      $wsh.SendKeys('^v')
      [Console]::Out.WriteLine('ok')
    }
    else {
      [Console]::Out.WriteLine('err')
    }
  } catch {
    [Console]::Out.WriteLine('err')
  }
  [Console]::Out.Flush()
}
