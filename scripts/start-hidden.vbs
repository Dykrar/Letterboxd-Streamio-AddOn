' Starts the addon with no window (Windows). A shortcut to this file in the Startup folder
' (Win+R, shell:startup) makes it start at login. Output goes to data\addon.log.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
sh.Run "cmd /c node src\server.js >> data\addon.log 2>&1", 0, False
