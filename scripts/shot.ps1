# Dev-Screenshot-Helfer für Blitztext.
# Aufruf:  pwsh -File scripts/shot.ps1 -Out docs/x.png [-Phase recording] [-Type transcription]
param(
  [string]$Out = "docs/shot.png",
  [string]$Phase = "",
  [string]$Type = "transcription"
)
$ErrorActionPreference = 'Continue'

$sig = @'
using System;
using System.Runtime.InteropServices;
public class Cap {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
  [StructLayout(LayoutKind.Sequential)] public struct R { public int L,T,Rr,B; }
}
'@
if (-not ('Cap' -as [type])) { Add-Type -TypeDefinition $sig }
[void][Cap]::SetProcessDPIAware()
Add-Type -AssemblyName System.Drawing

Get-Process electron -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

$env:BLITZTEXT_DEV = '1'
$env:BLITZTEXT_DEV_PHASE = $Phase
$env:BLITZTEXT_DEV_TYPE = $Type
$p = Start-Process -FilePath ".\node_modules\.bin\electron.cmd" -ArgumentList "." -PassThru -WindowStyle Normal
$env:BLITZTEXT_DEV = '0'
$env:BLITZTEXT_DEV_PHASE = ''
Start-Sleep -Seconds 5

$proc = Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if ($null -eq $proc) {
  "No window handle found."
} else {
  $r = New-Object Cap+R
  [void][Cap]::GetWindowRect($proc.MainWindowHandle, [ref]$r)
  $w = $r.Rr - $r.L; $h = $r.B - $r.T
  $pad = 26
  $x = [Math]::Max(0, $r.L - $pad); $y = [Math]::Max(0, $r.T - $pad)
  $cw = $w + $pad * 2; $ch = $h + $pad * 2
  $bmp = New-Object System.Drawing.Bitmap($cw, $ch)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($x, $y, 0, 0, (New-Object System.Drawing.Size($cw, $ch)))
  $g.Dispose()
  $dir = Split-Path $Out
  if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
  $bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  "Saved: $Out (${w}x${h} @ phase='$Phase')"
}

Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
Get-Process electron -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
