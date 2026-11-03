' Opens Stremio with your addons: starts this Letterboxd addon, and the MAL addon if it sits next to it
' (..\mal-stremio-addon), with no window. Then opens Stremio, and stops the addons it started once
' Stremio is closed. An addon that was already running (e.g. started at logon) is left alone.
' Point your Stremio shortcut at this file (target: wscript.exe "<this file>"). Logs: <addon>\data\addon.log.
Option Explicit

' Leave empty to look in the usual install folders, or put the full path to Stremio's .exe here.
Const STREMIO_EXE = ""

Dim fso, sh, wmi, addonDir, docsDir, servers, started, exe, srv, dir, i, p
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
Set wmi = GetObject("winmgmts:\\.\root\cimv2")
addonDir = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
docsDir = fso.GetParentFolderName(addonDir)
servers = Array(addonDir & "\src\server.js", docsDir & "\mal-stremio-addon\src\server.js")
started = Array(False, False)

Function AddonProcesses(server)
  Set AddonProcesses = wmi.ExecQuery("SELECT * FROM Win32_Process WHERE Name = 'node.exe' AND CommandLine LIKE '%" & Replace(server, "\", "\\") & "%'")
End Function

Function StremioRunning()
  StremioRunning = wmi.ExecQuery("SELECT * FROM Win32_Process WHERE Name LIKE 'stremio%.exe'").Count > 0
End Function

Function FindStremio()
  Dim candidates, c
  FindStremio = ""
  If STREMIO_EXE <> "" Then FindStremio = STREMIO_EXE : Exit Function
  candidates = Array( _
    "%LOCALAPPDATA%\Programs\LNV\Stremio-4\stremio.exe", _
    "%LOCALAPPDATA%\Programs\Stremio\stremio.exe", _
    "%LOCALAPPDATA%\Programs\Stremio\stremio-shell-ng.exe", _
    "%ProgramFiles%\Stremio\stremio.exe", _
    "%ProgramFiles%\Stremio\stremio-shell-ng.exe")
  For Each c In candidates
    c = sh.ExpandEnvironmentStrings(c)
    If fso.FileExists(c) Then FindStremio = c : Exit Function
  Next
End Function

' 1. Start each addon that exists and isn't running yet, from its own folder (so it finds its .env).
For i = 0 To UBound(servers)
  srv = servers(i)
  If fso.FileExists(srv) Then
    If AddonProcesses(srv).Count = 0 Then
      dir = fso.GetParentFolderName(fso.GetParentFolderName(srv))
      sh.CurrentDirectory = dir
      sh.Run "cmd /c node """ & srv & """ >> """ & dir & "\data\addon.log"" 2>&1", 0, False
      started(i) = True
    End If
  End If
Next
WScript.Sleep 2000

Function StremioPid()
  Dim procs, q
  StremioPid = 0
  ' The window belongs to the shell, not to stremio-runtime.exe (its streaming server).
  Set procs = wmi.ExecQuery("SELECT * FROM Win32_Process WHERE Name = 'stremio.exe' OR Name = 'stremio-shell-ng.exe'")
  For Each q In procs
    StremioPid = q.ProcessId : Exit Function
  Next
End Function

' 2. Open Stremio. If it is already open (maybe hidden in the tray), bring its window to the front.
If StremioRunning() Then
  If Not sh.AppActivate(StremioPid()) Then
    ' Window hidden in the tray: launching the exe again shows the running instance (Stremio is single-instance).
    exe = FindStremio()
    If exe <> "" Then sh.Run """" & exe & """", 1, False
  End If
  ' Another copy of this script is already waiting on that Stremio; only stay if this run started an addon.
  If Not (started(0) Or started(1)) Then WScript.Quit 0
Else
  exe = FindStremio()
  If exe = "" Then
    MsgBox "Couldn't find Stremio. Put the path to its .exe in STREMIO_EXE at the top of " & WScript.ScriptFullName, 48, "Stremio addons"
    WScript.Quit 1
  End If
  sh.Run """" & exe & """", 1, False
  WScript.Sleep 10000
End If

' 3. Wait until Stremio is closed, then stop the addons this script started.
Do While StremioRunning()
  WScript.Sleep 5000
Loop
For i = 0 To UBound(servers)
  If started(i) Then
    For Each p In AddonProcesses(servers(i))
      p.Terminate
    Next
  End If
Next
