# Uebernimmt die Daten der bestehenden WSL-Installation in die Windows-Fassung.
#
#   powershell -ExecutionPolicy Bypass -File scripts\daten-uebernehmen.ps1
#
# Die bestehende Installation bleibt dabei unangetastet. Sie kann parallel
# weiterlaufen, bis die Windows-Fassung sich bewaehrt hat - deshalb wird hier
# kopiert und nicht verschoben.

$ErrorActionPreference = "Stop"

$ziel = Join-Path $env:APPDATA "Projektmanager"
$uebergabe = Join-Path $ziel "uebernahme"
New-Item -ItemType Directory -Force -Path $uebergabe | Out-Null

Write-Host "[1/3] Datenbank aus der WSL sichern"
$dump = Join-Path $uebergabe "wsl-db.sql"
wsl -d Ubuntu -e bash -lc "cd ~/projektmanager && docker compose exec -T db pg_dump -U pm -d pm --clean --if-exists" |
  Out-File -FilePath $dump -Encoding utf8
if (-not (Test-Path $dump) -or (Get-Item $dump).Length -lt 1kb) {
  throw "Der Dump ist leer geblieben - laeuft der Stack in der WSL?"
}
Write-Host ("      {0:N0} KB" -f ((Get-Item $dump).Length / 1kb))

Write-Host "[2/3] Dateiablage kopieren"
$uploads = Join-Path $ziel "uploads"
New-Item -ItemType Directory -Force -Path $uploads | Out-Null
$archiv = Join-Path $uebergabe "uploads.tar"
wsl -d Ubuntu -e bash -lc "cd ~/projektmanager && docker compose run --rm --no-deps -T --entrypoint sh app -c 'tar cf - -C /data uploads'" |
  Set-Content -Path $archiv -Encoding Byte
tar -xf $archiv -C $ziel
Remove-Item $archiv

Write-Host "[3/3] Fertig"
Write-Host ""
Write-Host "Der Dump liegt unter:"
Write-Host "  $dump"
Write-Host ""
Write-Host "Er wird beim naechsten Start der Anwendung eingespielt, sobald die"
Write-Host "Datenbank steht. Die WSL-Installation ist unveraendert."
