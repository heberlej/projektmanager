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

## Übernahme der bestehenden Installation

Der Umzug aus WSL ist ein `pg_dump` und ein Kopieren der Dateiablage –
`scripts/daten-uebernehmen.ps1` in diesem Ordner macht beides. Die bestehende
Installation bleibt dabei unangetastet; sie lässt sich parallel weiterbetreiben,
bis die Windows-Fassung sich bewährt hat.

---

## Offen

Was noch fehlt, ehrlich aufgelistet:

- [ ] PostgreSQL-Binärdateien beschaffen und einbinden (Beschaffung beim Bauen,
      nicht im Repo – 250 MB gehören nicht in Git)
- [ ] Erststart: `initdb`, Rolle anlegen, Migrationen fahren, Seed
- [ ] Freien Port suchen statt 3000 fest annehmen
- [ ] Sauberes Herunterfahren (Postgres will `pg_ctl stop`, nicht `SIGKILL`)
- [ ] Installer mit electron-builder bauen und auf einem frischen Benutzer testen
- [ ] Add-in-Einrichtung als eigener, erklärter Schritt
- [ ] Aktualisierung: Migrationen beim Start einer neueren Fassung
