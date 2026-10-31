' Opens Stremio with the addon: starts the addon hidden (if it isn't already running), opens Stremio,
' and stops the addon again once Stremio is closed. Point your Stremio shortcut at this file
' (target: wscript.exe "<this file>"). Output goes to data\addon.log.
Option Explicit

' Leave empty to look in the usual install folders, or put the full path to Stremio's .exe here.
Const STREMIO_EXE = ""

Dim fso, sh, wmi, addonDir, server, exe
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
Set wmi = GetObject("winmgmts:\\.\root\cimv2")
addonDir = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
server = addonDir & "\src\server.js"

Function AddonProcesses()
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

' 1. Start the addon unless it is already running.
If AddonProcesses().Count = 0 Then
  sh.CurrentDirectory = addonDir
  sh.Run "cmd /c node """ & server & """ >> """ & addonDir & "\data\addon.log"" 2>&1", 0, False
  WScript.Sleep 2000
End If

' 2. Open Stremio (unless it is already open).
If Not StremioRunning() Then
  exe = FindStremio()
  If exe = "" Then
    MsgBox "Couldn't find Stremio. Put the path to its .exe in STREMIO_EXE at the top of " & WScript.ScriptFullName, 48, "Letterboxd addon"
    WScript.Quit 1
  End If
  sh.Run """" & exe & """", 1, False
  WScript.Sleep 10000
End If

' 3. Wait until Stremio is closed, then stop the addon.
Do While StremioRunning()
  WScript.Sleep 5000
Loop
Dim p
For Each p In AddonProcesses()
  p.Terminate
Next
