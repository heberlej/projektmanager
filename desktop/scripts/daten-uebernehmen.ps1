# Uebernimmt die Daten der bestehenden WSL-Installation in die Windows-Fassung.
#
#   powershell -ExecutionPolicy Bypass -File scripts\daten-uebernehmen.ps1
#
# Die bestehende Installation bleibt unangetastet - es wird nur gelesen. Sie
# kann parallel weiterlaufen, bis die Windows-Fassung sich bewaehrt hat.
#
# Die Anwendung muss dafuer geschlossen sein: das Einspielen laeuft gegen die
# mitgelieferte Datenbank, und deren Datenverzeichnis haelt der laufende
# Prozess gesperrt.

$ErrorActionPreference = "Stop"

$daten = Join-Path $env:APPDATA "Projektmanager"
$pgdata = Join-Path $daten "pgdata"
$uebergabe = Join-Path $daten "uebernahme"

if (Get-Process Projektmanager -ErrorAction SilentlyContinue) {
  throw "Die Anwendung laeuft noch. Erst schliessen, dann erneut starten."
}
if (-not (Test-Path (Join-Path $pgdata "PG_VERSION"))) {
  throw "Keine Datenbank unter $pgdata - die Anwendung muss einmal gestartet worden sein."
}

# Die mitgelieferten Postgres-Werkzeuge suchen: erst die Installation, dann das
# entpackte Bauergebnis.
$kandidaten = @(
  (Join-Path $env:LOCALAPPDATA "Programs\Projektmanager\resources\pgsql\bin"),
  (Join-Path $env:LOCALAPPDATA "projektmanager-bau\dist\win-unpacked\resources\pgsql\bin")
)
$bin = $kandidaten | Where-Object { Test-Path (Join-Path $_ "pg_ctl.exe") } | Select-Object -First 1
if (-not $bin) { throw "Postgres-Werkzeuge nicht gefunden. Ist die Anwendung installiert?" }

New-Item -ItemType Directory -Force -Path $uebergabe | Out-Null
$stempel = Get-Date -Format "yyyyMMdd-HHmmss"

# Windows-Pfad in die WSL-Schreibweise uebersetzen. Beides muss direkt dorthin
# schreiben: durch die PowerShell-Pipeline geleitet, verliert ein Tar-Archiv
# seine Bytes, und der SQL-Dump bekaeme ein BOM, an dem psql sich verschluckt.
function AlsWslPfad($p) {
  $x = $p -replace "\\", "/"
  return "/mnt/" + $x.Substring(0,1).ToLower() + $x.Substring(2)
}

Write-Host "[1/5] Datenbank aus der WSL lesen"
$dump = Join-Path $uebergabe "wsl-$stempel.sql"
$dumpWsl = AlsWslPfad $dump
wsl -d Ubuntu -e bash -lc "cd ~/projektmanager && docker compose exec -T db pg_dump -U pm -d pm --clean --if-exists > '$dumpWsl'"
if (-not (Test-Path $dump) -or (Get-Item $dump).Length -lt 2kb) {
  throw "Der Dump ist leer geblieben - laeuft der Stack in der WSL?"
}
Write-Host ("      {0:N0} KB" -f ((Get-Item $dump).Length / 1kb))

# Der Dump kommt von pg_dump 16.14 aus dem Container, eingespielt wird er mit
# dem mitgelieferten psql 16.4. Die neueren Anweisungen \restrict und
# \unrestrict kennt das aeltere psql nicht und bricht ab. Sie schuetzen davor,
# dass ein fremder Dump beim Einspielen Befehle unterschiebt - hier stammt er
# aus der eigenen Datenbank, also fallen sie ersatzlos weg.
$gefiltert = (Get-Content $dump) | Where-Object { $_ -notmatch '^\\(un)?restrict' }
Set-Content -Path $dump -Value $gefiltert -Encoding utf8

Write-Host "[2/5] Dateiablage kopieren"
$archiv = Join-Path $uebergabe "uploads-$stempel.tar"
$archivWsl = AlsWslPfad $archiv
wsl -d Ubuntu -e bash -lc "cd ~/projektmanager && docker compose run --rm --no-deps -T --entrypoint sh app -c 'tar cf - -C /data uploads' > '$archivWsl'"
tar -xf $archiv -C $daten
Remove-Item $archiv
Write-Host "      nach $daten\uploads"

Write-Host "[3/5] Mitgelieferte Datenbank starten"
$port = 55432
$pw = (Get-Content (Join-Path $daten "db-passwort") -Raw).Trim()
$env:PGPASSWORD = $pw
# Nicht ueber pg_ctl: der Aufruf kehrt hier nicht zurueck, weil PowerShell auf
# das Ende der Ausgabe wartet und der Server die Kanaele offen haelt - auch mit
# Protokolldatei. Ein Anlauf ist genau daran eine Stunde lang haengen geblieben.
# Deshalb postgres.exe direkt starten und selbst warten, bis sie antwortet;
# dieselbe Loesung benutzt der Hauptprozess der Anwendung.
$pgLog = Join-Path $uebergabe "postgres-$stempel.log"
$server = Start-Process -FilePath (Join-Path $bin "postgres.exe") `
  -ArgumentList "-D", "`"$pgdata`"", "-p", $port, "-h", "127.0.0.1" `
  -RedirectStandardError $pgLog -WindowStyle Hidden -PassThru

$bereit = $false
foreach ($i in 1..40) {
  Start-Sleep -Milliseconds 500
  & (Join-Path $bin "pg_isready.exe") -h 127.0.0.1 -p $port -U pm -q
  if ($LASTEXITCODE -eq 0) { $bereit = $true; break }
}
if (-not $bereit) { throw "Die Datenbank ist nicht bereit geworden - siehe $pgLog" }
Write-Host "      laeuft auf Port $port"

try {
  Write-Host "[4/5] Sicherheitskopie des jetzigen Stands"
  $vorher = Join-Path $uebergabe "vor-uebernahme-$stempel.sql"
  & (Join-Path $bin "pg_dump.exe") -h 127.0.0.1 -p $port -U pm -d pm --clean --if-exists -f $vorher
  Write-Host "      $vorher"

  Write-Host "[5/5] Daten einspielen"
  # Der Dump traegt --clean: er raeumt die Seed-Daten weg und setzt den Stand
  # der WSL-Installation an ihre Stelle. -f statt Pipeline, damit psql die
  # Datei selbst liest - so bleibt die Kodierung, wie sie ist.
  $meldungen = & (Join-Path $bin "psql.exe") -h 127.0.0.1 -p $port -U pm -d pm -q -v ON_ERROR_STOP=0 -f $dump 2>&1
  $fehler = $meldungen | Select-String -Pattern "FEHLER|ERROR" | Select-Object -First 5
  if ($fehler) { Write-Host "      Meldungen:"; $fehler | ForEach-Object { Write-Host "        $_" } }

  $zahlen = & (Join-Path $bin "psql.exe") -h 127.0.0.1 -p $port -U pm -d pm -tAc `
    "SELECT (SELECT count(*) FROM ""Project"") || ' Projekte, ' || (SELECT count(*) FROM ""Task"") || ' Aufgaben, ' || (SELECT count(*) FROM ""MailLink"") || ' Mails'"
  Write-Host "      uebernommen: $zahlen"
}
finally {
  # Sauber herunterfahren, sonst bleibt eine Sperrdatei liegen und die
  # Anwendung startet beim naechsten Mal in die Wiederherstellung.
  Start-Process -FilePath (Join-Path $bin "pg_ctl.exe") `
    -ArgumentList "-D", "`"$pgdata`"", "-m", "fast", "stop" -Wait -WindowStyle Hidden
  Start-Sleep -Seconds 2
}

Write-Host ""
Write-Host "Fertig. Die WSL-Installation ist unveraendert."
Write-Host "Zurueck zum vorherigen Stand der Windows-Fassung:"
Write-Host "  der Dump davor liegt in $uebergabe"
