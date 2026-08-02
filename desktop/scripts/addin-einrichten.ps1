# Richtet das Outlook-Add-in fuer die Windows-Fassung ein.
#
#   powershell -ExecutionPolicy Bypass -File scripts\addin-einrichten.ps1
#
# Bewusst ein eigener Schritt und nicht Teil des Installers: Outlook verlangt
# HTTPS mit einem Zertifikat, dem Windows vertraut. Wer das Add-in nicht
# braucht, soll damit nie in Beruehrung kommen.
#
# Dieses Skript legt KEINE neue Zertifizierungsstelle an. Es benutzt das
# vorhandene mkcert-Zertifikat aus der WSL-Installation - dessen Wurzel liegt
# seit der Ersteinrichtung im Zertifikatspeicher. Damit aendert sich am
# Vertrauen dieses Rechners nichts.

$ErrorActionPreference = "Stop"

$daten = Join-Path $env:APPDATA "Projektmanager"
$zert = Join-Path $daten "zertifikate"
$port = 44383

Write-Host "[1/4] Vertrauenswuerdige Wurzel pruefen"
$wurzel = Get-ChildItem Cert:\CurrentUser\Root | Where-Object { $_.Subject -like "*mkcert*" }
if (-not $wurzel) {
  Write-Host ""
  Write-Host "  Es liegt keine mkcert-Wurzel im Zertifikatspeicher."
  Write-Host "  Ohne sie warnt Outlook, und das Taskpane bleibt weiss."
  Write-Host ""
  Write-Host "  Einmalig nachholen (oeffnet eine Administratorabfrage):"
  Write-Host "    winget install FiloSottile.mkcert"
  Write-Host "    mkcert -install"
  Write-Host ""
  throw "Abgebrochen - ohne vertrauenswuerdige Wurzel hat das Add-in keinen Zweck."
}
Write-Host "      $($wurzel.Subject.Substring(0, [Math]::Min(48, $wurzel.Subject.Length)))"

Write-Host "[2/4] Zertifikat uebernehmen"
New-Item -ItemType Directory -Force -Path $zert | Out-Null
$vorhanden = wsl -d Ubuntu -e bash -lc "test -f ~/projektmanager/certs/pm.localhost.pem && echo ja"
if ($vorhanden -notmatch "ja") {
  throw "Kein Zertifikat in der WSL gefunden. Dort erzeugen: mkcert -cert-file certs/pm.localhost.pem -key-file certs/pm.localhost-key.pem pm.localhost"
}
wsl -d Ubuntu -e bash -lc "cat ~/projektmanager/certs/pm.localhost.pem" |
  Out-File (Join-Path $zert "pm.localhost.pem") -Encoding ascii
wsl -d Ubuntu -e bash -lc "cat ~/projektmanager/certs/pm.localhost-key.pem" |
  Out-File (Join-Path $zert "pm.localhost-key.pem") -Encoding ascii
Write-Host "      nach $zert"

Write-Host "[3/4] Namensaufloesung pruefen"
$hosts = Get-Content "$env:SystemRoot\System32\drivers\etc\hosts" -ErrorAction SilentlyContinue
if ($hosts -match "pm\.localhost") {
  Write-Host "      pm.localhost ist eingetragen"
} else {
  Write-Host "      HINWEIS: pm.localhost fehlt in der hosts-Datei."
  Write-Host "      Als Administrator ergaenzen: 127.0.0.1 pm.localhost"
}

Write-Host "[4/4] Manifest schreiben"
# Das Manifest der Docker-Fassung zeigt auf https://pm.localhost ohne Port.
# Die Windows-Fassung hoert auf einem hohen Port, weil 443 Administratorrechte
# verlangt - deshalb eine eigene Fassung mit eigener Kennung, sonst haelt
# Outlook beide fuer dasselbe Add-in.
$quelle = wsl -d Ubuntu -e bash -lc "cat ~/projektmanager/public/manifest.xml"
$neu = $quelle -replace "https://pm\.localhost", "https://pm.localhost:$port"
$neuerAusweis = [guid]::NewGuid().ToString()
$neu = $neu -replace "(?<=<Id>)[0-9a-fA-F-]{36}(?=</Id>)", $neuerAusweis
$neu = $neu -replace "(?<=<DisplayName DefaultValue=`")([^`"]*)", "`$1 (Windows)"
$ziel = Join-Path $daten "manifest-windows.xml"
$neu | Out-File $ziel -Encoding utf8

Write-Host ""
Write-Host "Fertig. In Outlook einbinden:"
Write-Host "  Einstellungen -> Allgemein -> Add-Ins verwalten -> Meine Add-Ins"
Write-Host "  -> Benutzerdefiniertes Add-In -> Aus Datei hinzufuegen"
Write-Host ""
Write-Host "  $ziel"
Write-Host ""
Write-Host "Vorher pruefen, dass die Anwendung laeuft und"
Write-Host "  https://pm.localhost:$port"
Write-Host "im Browser ohne Zertifikatswarnung laedt."
