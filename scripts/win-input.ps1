# Persistenter Win32-Helfer für Blitztext (Fokus erfassen + Einfügen).
# Protokoll über stdin/stdout, eine Antwortzeile pro Befehl:
#   capture        -> gibt das HWND des aktuellen Vordergrundfensters zurück
#   paste <hwnd>    -> aktiviert das Fenster und sendet Strg+V, gibt "ok" zurück
#
# Strg+V wird per keybd_event gesendet (NICHT WScript.Shell.SendKeys) — SendKeys
# hat einen bekannten Windows-Bug, der NumLock ausschaltet. Zusätzlich wird der
# NumLock-Zustand vor dem Einfügen gesichert und danach wiederhergestellt.
$ErrorActionPreference = 'Stop'

$sig = @'
using System;
using System.Runtime.InteropServices;
public class WI {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern short GetKeyState(int vk);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
}
'@
Add-Type -TypeDefinition $sig

$VK_MENU    = [byte]0x12   # ALT
$VK_CONTROL = [byte]0x11
$VK_V       = [byte]0x56
$VK_NUMLOCK = [byte]0x90
$KEYUP      = [uint32]2
$KEYEXT     = [uint32]1
$SW_RESTORE = 9

function Get-NumLockOn { return ([WI]::GetKeyState(0x90) -band 1) }

function Toggle-NumLock {
  [WI]::keybd_event($VK_NUMLOCK, 0x45, $KEYEXT, [UIntPtr]::Zero)
  [WI]::keybd_event($VK_NUMLOCK, 0x45, ($KEYEXT -bor $KEYUP), [UIntPtr]::Zero)
}

function Force-Foreground([IntPtr]$h) {
  if ($h -eq [IntPtr]::Zero) { return }
  if ([WI]::IsIconic($h)) { [void][WI]::ShowWindow($h, $SW_RESTORE) }
  # Alt-Tipp entsperrt SetForegroundWindow (Windows-Foreground-Lock-Workaround).
  [WI]::keybd_event($VK_MENU, 0, 0, [UIntPtr]::Zero)
  [WI]::keybd_event($VK_MENU, 0, $KEYUP, [UIntPtr]::Zero)
  [void][WI]::SetForegroundWindow($h)
}

function Send-Paste {
  # Strg+V über keybd_event (kein SendKeys -> kein NumLock-Bug).
  [WI]::keybd_event($VK_CONTROL, 0, 0, [UIntPtr]::Zero)   # Ctrl down
  [WI]::keybd_event($VK_V, 0, 0, [UIntPtr]::Zero)         # V down
  Start-Sleep -Milliseconds 10
  [WI]::keybd_event($VK_V, 0, $KEYUP, [UIntPtr]::Zero)    # V up
  [WI]::keybd_event($VK_CONTROL, 0, $KEYUP, [UIntPtr]::Zero) # Ctrl up
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
      $numBefore = Get-NumLockOn
      Force-Foreground $h
      Start-Sleep -Milliseconds 60
      Send-Paste
      Start-Sleep -Milliseconds 20
      # NumLock wiederherstellen, falls sich der Zustand verändert hat.
      if ((Get-NumLockOn) -ne $numBefore) { Toggle-NumLock }
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
