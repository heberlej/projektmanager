# Baut die Windows-Fassung zusammen.
#
#   powershell -ExecutionPolicy Bypass -File scripts\zusammenbauen.ps1
#
# Gebaut wird ausserhalb von OneDrive, unter %LOCALAPPDATA%\projektmanager-bau.
# Das ist keine Marotte: 320 MB Postgres-Binaerdateien und ein halbes Gigabyte
# Bauergebnis in einem synchronisierten Ordner heisst, dass OneDrive waehrend
# des Entpackens dazwischenfunkt - beim ersten Versuch fehlte danach das
# komplette bin-Verzeichnis.

$ErrorActionPreference = "Stop"

$quelle = Split-Path -Parent $PSScriptRoot          # desktop\
$hauptprojekt = Split-Path -Parent $quelle          # das Repo
$bau = Join-Path $env:LOCALAPPDATA "projektmanager-bau"
$node = Join-Path $quelle ".werkzeug\node-v22.11.0-win-x64"

# Node muss in den PATH, nicht nur ueber den vollen Pfad aufgerufen werden:
# Electrons Nachinstallation startet ein `node install.js` in einer eigenen
# Eingabeaufforderung. Ohne PATH-Eintrag findet die es nicht und die
# Installation bricht mit "Der Befehl node ... konnte nicht gefunden werden" ab.
$env:Path = "$node;$env:Path"

Write-Host "Baustelle: $bau"
New-Item -ItemType Directory -Force -Path $bau | Out-Null

# --- 1. Quellen der Huelle ---------------------------------------------------
Write-Host "[1/5] Huelle kopieren"
Copy-Item (Join-Path $quelle "main.mjs") $bau -Force
Copy-Item (Join-Path $quelle "postgres.mjs") $bau -Force
Copy-Item (Join-Path $quelle "package.json") $bau -Force

# --- 2. Anwendung ------------------------------------------------------------
Write-Host "[2/5] Anwendung uebernehmen"
$app = Join-Path $bau "beigaben\app"
Remove-Item $app -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $app | Out-Null

Copy-Item (Join-Path $hauptprojekt ".next\standalone\*") $app -Recurse -Force
New-Item -ItemType Directory -Force -Path (Join-Path $app ".next") | Out-Null
Copy-Item (Join-Path $hauptprojekt ".next\static") (Join-Path $app ".next\static") -Recurse -Force
Copy-Item (Join-Path $hauptprojekt "public") (Join-Path $app "public") -Recurse -Force
Copy-Item (Join-Path $hauptprojekt "prisma") (Join-Path $app "prisma") -Recurse -Force

# Der Standalone-Build zieht nur mit, was der Server zur Laufzeit braucht - die
# Prisma-Kommandozeile gehoert nicht dazu. Fuer `migrate deploy` beim Start muss
# sie mit.
Write-Host "      Prisma-Kommandozeile mitnehmen"
# Der Standalone-Build zieht nur mit, was der Server zur Laufzeit anfasst - die
# Kommandozeile gehoert nicht dazu, die Anwendung ruft sie aber beim Start fuer
# `migrate deploy`.
#
# Einzelne Pakete herauszupicken funktioniert nicht: npm legt die
# Abhaengigkeiten flach ins Wurzelverzeichnis, und die Kommandozeile zieht eine
# ganze Kette nach (@prisma/config, @prisma/engines und deren Abhaengigkeiten).
# Zwei Anlaeufe sind genau daran gescheitert. Deshalb loest npm den Baum hier
# selbst auf - in einem eigenen kleinen Verzeichnis, damit nur landet, was
# wirklich gebraucht wird.
$prismaVersion = (Get-Content (Join-Path $hauptprojekt "node_modules\prisma\package.json") -Raw | ConvertFrom-Json).version
$cliDir = Join-Path $bau "prisma-cli"
if (-not (Test-Path (Join-Path $cliDir "node_modules\prisma\build\index.js"))) {
  Write-Host "      loese Abhaengigkeiten fuer prisma@$prismaVersion auf"
  New-Item -ItemType Directory -Force -Path $cliDir | Out-Null
  Set-Content (Join-Path $cliDir "package.json") '{ "name": "prisma-cli-buendel", "private": true }' -Encoding utf8
  Push-Location $cliDir
  & (Join-Path $node "npm.cmd") install "prisma@$prismaVersion" --omit=dev --no-audit --no-fund --loglevel=error
  Pop-Location
}
Copy-Item (Join-Path $cliDir "node_modules\*") (Join-Path $app "node_modules") -Recurse -Force

# --- 3. Datenbank ------------------------------------------------------------
Write-Host "[3/5] Postgres pruefen"
$pg = Join-Path $bau "beigaben\pgsql"
if (-not (Test-Path (Join-Path $pg "bin\postgres.exe"))) {
  throw "Postgres fehlt unter $pg - erst scripts\postgres-holen.ps1 ausfuehren"
}
# Was hier niemand braucht und 150 MB kostet.
foreach ($weg in @("doc", "include", "pgAdmin 4", "StackBuilder", "symbols")) {
  Remove-Item (Join-Path $pg $weg) -Recurse -Force -ErrorAction SilentlyContinue
}

# --- 4. Electron -------------------------------------------------------------
Write-Host "[4/5] Electron einrichten"
Push-Location $bau
& (Join-Path $node "npm.cmd") install --no-audit --no-fund --loglevel=error
Pop-Location

# --- 5. Installer ------------------------------------------------------------
Write-Host "[5/5] Installer bauen"
Push-Location $bau
& (Join-Path $node "npx.cmd") electron-builder --win nsis
Pop-Location

$setup = Get-ChildItem (Join-Path $bau "dist") -Filter "*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($setup) {
  Write-Host ""
  Write-Host "Fertig: $($setup.FullName)"
  Write-Host ("Groesse: {0:N0} MB" -f ($setup.Length / 1MB))
} else {
  throw "Kein Installer entstanden"
}
