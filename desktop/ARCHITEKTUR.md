# Projektmanager als Windows-Anwendung

Ziel: ein Installer, ein Startmenü-Eintrag, ein eigenes Fenster – kein WSL,
kein Docker, kein Browser. Dieselbe Anwendung, dasselbe Repo, nur anders
verpackt.

> **Stand: Gerüst.** Die Entscheidungen unten sind getroffen und begründet, die
> Dateien in diesem Ordner setzen sie um. Gebaut und durchgetestet ist der
> Installer **noch nicht** – was fehlt, steht unten unter „Offen".

---

## Warum das nicht „einfach" ist

Drei Punkte, an denen echte Arbeit hängt. Der Rest ist Fleiß.

### 1. Die Datenbank muss mit

Die Anwendung hängt tief an PostgreSQL: **27 Stellen** in den Migrationen
benutzen `tsvector`-Spalten, `websearch_to_tsquery`, `ts_headline` und
GIN-Indizes, dazu fünf Enums und eine rohe Abfrage über fünf `UNION`-Zweige.

Ein Wechsel auf SQLite klingt verlockend (eine Datei, kein Prozess), hieße aber:
die gesamte Volltextsuche auf FTS5 neu bauen, die Enums zu Zeichenketten
machen, die Rangfolge selbst rechnen. Das wäre ein zweiter Zweig derselben
Anwendung – genau das, was man nicht will.

**Entscheidung: PostgreSQL wird mitgeliefert.** Die Windows-Binärdateien von
EnterpriseDB sind ohne Installer verwendbar: beim ersten Start legt die
Anwendung mit `initdb` ein Datenverzeichnis unter `%APPDATA%` an und startet
`postgres.exe` als Kindprozess auf einem freien Port. Der übrige Code bleibt
Zeile für Zeile unverändert – auch die Migrationen.

Preis: rund 250 MB im Installer.

### 2. Das Add-in braucht HTTPS mit vertrauenswürdigem Zertifikat

> **Gelöst, ohne den Zertifikatspeicher anzufassen.** Die mkcert-Wurzel liegt
> seit der Ersteinrichtung der WSL-Fassung im Speicher, und ein gültiges
> Zertifikat für `pm.localhost` gibt es dort auch. `scripts\addin-einrichten.ps1`
> übernimmt beides, statt eine zweite Zertifizierungsstelle anzulegen – am
> Vertrauen dieses Rechners ändert sich damit nichts. Die Anwendung stellt einen
> HTTPS-Zuhörer auf Port 44383 davor (nicht 443, das verlangt
> Administratorrechte) und reicht an den internen Port weiter. Ohne hinterlegtes
> Zertifikat passiert schlicht nichts – wer das Add-in nicht braucht, merkt von
> alldem nichts.
>
> Das Manifest bekommt eine eigene Kennung, sonst hält Outlook die Docker- und
> die Windows-Fassung für dasselbe Add-in.

Die ursprüngliche Überlegung, warum das der unangenehme Punkt war:

Das ist der unangenehmste Punkt, und er betrifft nur das Outlook-Add-in – die
Anwendung selbst läuft im eigenen Fenster ohne HTTPS.

Outlook lädt Add-in-Seiten ausschließlich über HTTPS mit einem Zertifikat, dem
Windows vertraut. Heute erledigt das Caddy mit einem mkcert-Zertifikat, dessen
Wurzel du einmal von Hand installiert hast. In einem Installer heißt dasselbe:
**eine lokale Zertifizierungsstelle in den Windows-Zertifikatspeicher legen.**

Das ist ein Eingriff in den Vertrauensspeicher des Rechners und braucht
Administratorrechte. Wer den privaten Schlüssel dieser Stelle in die Hand
bekommt, kann sich gegenüber deinem Rechner für jede beliebige Seite ausgeben.
Vertretbar ist das nur, wenn der Schlüssel auf dem Rechner erzeugt wird, dort
bleibt und niemals in den Installer wandert.

**Entscheidung:** Der Installer selbst fasst den Zertifikatspeicher **nicht**
an. Die Anwendung serviert das Add-in bei Bedarf über einen eigenen
HTTPS-Zuhörer, und die Einrichtung des Zertifikats bleibt ein bewusster,
getrennter Schritt – ein Knopf „Add-in einrichten" in den Einstellungen, der
erklärt, was passiert, und die Administratorabfrage auslöst. Wer das Add-in
nicht braucht, bekommt den Eingriff nie zu sehen.

### 3. Ohne Signatur meckert Windows

Ein unsignierter Installer landet bei SmartScreen mit „Herausgeber unbekannt".
Für den Eigengebrauch hinnehmbar, für eine Weitergabe an Kollegen nicht. Eine
Signatur braucht ein Zertifikat einer anerkannten Stelle und kostet Geld.

---

## Aufbau

```
Electron-Hauptprozess
├── postgres.exe          Kindprozess, Datenverzeichnis in %APPDATA%
├── Next.js (standalone)  Kindprozess auf 127.0.0.1, freier Port
└── BrowserWindow         zeigt http://127.0.0.1:<port>
```

**Warum Electron und nicht Tauri.** Tauri wäre schlanker, weil es die
Windows-eigene WebView2 benutzt. Nur braucht diese Anwendung ohnehin einen
Node-Prozess für den Next.js-Server – Tauri müsste ihn als „Sidecar"
mitschleppen und man hätte beides. Electron bringt Node schon mit.

**Warum kein Caddy mehr.** Caddy macht hier nur TLS. Im Fenster läuft alles über
`127.0.0.1` ohne TLS, und für das Add-in kann Node den HTTPS-Zuhörer selbst
stellen. Ein Baustein weniger.

**Datenablage.** Alles unter `%APPDATA%\Projektmanager`:

| | |
| --- | --- |
| `pgdata\` | Datenbank |
| `uploads\` | Dateiablage |
| `backups\` | Sicherungen |
| `zertifikate\` | nur wenn das Add-in eingerichtet wurde |

Das Deinstallieren lässt diesen Ordner stehen. Daten verschwinden nicht,
weil jemand ein Programm entfernt.

---

## Gebaut wird außerhalb von OneDrive

**Beides liegt draußen: die Baustelle und die Quelle.**

Die Baustelle ist `%LOCALAPPDATA%\projektmanager-bau`, nicht der Repo-Ordner.
Das ist keine Marotte, sondern Erfahrung aus dem ersten Versuch: 320 MB
Postgres-Binärdateien in einen synchronisierten Ordner zu entpacken endete
damit, dass das komplette `bin`-Verzeichnis fehlte – OneDrive greift beim
Entpacken dazwischen.

Dieselbe Ursache holte am 02.08.2026 den Next-Build ein, der noch aus dem
OneDrive-Ordner lief: über **zwanzig Minuten** ein Kern voll ausgelastet, ohne
dass eine einzige Datei in `.next` landete. Kein Deadlock, nur zehntausende
kleine Dateien unter Synchronisation. Derselbe Build aus
`C:\Users\jahe\projektmanager`: **neunzehn Sekunden.**

Seitdem ist `C:\Users\jahe\projektmanager` der Arbeitsbaum für die
Windows-Fassung – dort liegen `.next`, `node_modules` und das portable Node
unter `desktop\.werkzeug`. Nach OneDrive wandert nur der fertige Installer.

`scripts\zusammenbauen.ps1` legt die Baustelle an, kopiert Hülle und Anwendung
dorthin und ruft electron-builder. Im Repo bleiben nur Quellen.

Eine Stelle braucht dabei Handarbeit: Der Standalone-Build von Next zieht nur
mit, was der **Server zur Laufzeit** braucht. Die Prisma-Kommandozeile gehört
nicht dazu – die Anwendung ruft sie aber beim Start für `migrate deploy`. Sie
wird deshalb ausdrücklich mitkopiert.

---

## Übernahme der bestehenden Installation

Der Umzug aus WSL ist ein `pg_dump` und ein Kopieren der Dateiablage –
`scripts/daten-uebernehmen.ps1` in diesem Ordner macht beides. Die bestehende
Installation bleibt dabei unangetastet; sie lässt sich parallel weiterbetreiben,
bis die Windows-Fassung sich bewährt hat.

---

## Stand

- [x] PostgreSQL-Binärdateien beschaffen und einbinden
- [x] Erststart: `initdb`, Rolle anlegen, Migrationen fahren, Seed
- [x] Freien Port suchen statt 3000 fest annehmen
- [x] Sauberes Herunterfahren
- [x] Installer bauen (`Projektmanager-Setup-0.1.0.exe`, 169 MB)
- [x] Add-in-Einrichtung als eigener, erklärter Schritt
- [x] Anwendungssymbol
- [x] Übernahme der WSL-Daten
- [ ] Signatur – ohne gekauftes Zertifikat warnt SmartScreen beim ersten Start
- [ ] Aktualisierung auf eine neuere Fassung im laufenden Betrieb erproben

### Stolpersteine, die Zeit gekostet haben

Alle stehen als Begründung an der jeweiligen Stelle im Skript. Der Reihe nach:

1. **OneDrive** hat das Entpacken der 320 MB zerlegt – danach fehlte das
   komplette `bin`-Verzeichnis. Gebaut wird deshalb außerhalb.
2. **Electrons Nachinstallation** ruft blank `node`; mit portablem Node muss der
   PATH gesetzt sein.
3. **electron-builder** wollte macOS-Symlinks anlegen, was Windows ohne
   Administratorrechte verweigert. `signAndEditExecutable: false` umgeht das.
4. **Die Prisma-Kommandozeile** ließ sich nicht paketweise mitnehmen – npm legt
   Abhängigkeiten flach ab, und `Copy-Item` schiebt Ordner ineinander statt sie
   zu verschmelzen. Jetzt löst npm den Baum in einem eigenen Verzeichnis auf.
5. **Ein selbstgeschriebenes ICO** hat electron-builder nicht angenommen; aus
   dem PNG erzeugt es die Größen selbst.
6. **`pg_ctl start` kehrt unter PowerShell nicht zurück**, weil der Server die
   Ausgabekanäle offen hält – auch mit `-l`. Ein Anlauf hing daran eine Stunde.
   Der Umzug startet `postgres.exe` jetzt direkt und wartet mit `pg_isready`.
7. **`\restrict` im Dump**: `pg_dump` 16.14 aus dem Container schreibt eine
   Anweisung, die das mitgelieferte `psql` 16.4 nicht kennt. Sie wird vor dem
   Einspielen herausgefiltert.
