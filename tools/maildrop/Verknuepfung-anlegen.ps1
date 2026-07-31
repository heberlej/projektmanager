<#
    Legt eine Startmenue-Verknuepfung fuer MailDrop an. Von dort laesst sie sich
    per Rechtsklick an die Taskleiste anheften.

    Braucht keine Administratorrechte - alles landet im Benutzerprofil.
#>

[CmdletBinding()]
param(
    [string]$BaseUrl = 'https://pm.localhost',
    [switch]$Entfernen
)

$ErrorActionPreference = 'Stop'

$skript = Join-Path $PSScriptRoot 'MailDrop.ps1'
if (-not (Test-Path $skript)) { throw "MailDrop.ps1 nicht gefunden neben $PSScriptRoot" }

$startmenue = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
$ziel = Join-Path $startmenue 'Projektmanager MailDrop.lnk'

if ($Entfernen) {
    if (Test-Path $ziel) { Remove-Item $ziel -Force; "Verknuepfung entfernt: $ziel" }
    else { "Es gab keine Verknuepfung." }
    return
}

# powershell.exe laeuft standardmaessig im STA-Modus, den WinForms braucht.
$ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'

$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut($ziel)
$lnk.TargetPath = $ps
$lnk.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}" -BaseUrl "{1}"' -f $skript, $BaseUrl
$lnk.WorkingDirectory = $PSScriptRoot
$lnk.Description = 'Mail per Drag and Drop an ein Projekt anheften'
$lnk.IconLocation = "$env:SystemRoot\System32\imageres.dll,-1015"
$lnk.Save()
[void][Runtime.InteropServices.Marshal]::ReleaseComObject($shell)

@"
Verknuepfung angelegt:
  $ziel

Anheften an die Taskleiste:
  Startmenue oeffnen, "Projektmanager MailDrop" suchen,
  Rechtsklick -> Weitere -> An Taskleiste anheften

Andere Adresse als $BaseUrl :
  .\Verknuepfung-anlegen.ps1 -BaseUrl https://andere.adresse
"@
