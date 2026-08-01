# Projektmanager

Selbst gehostete Projektverwaltung für IT-Projektarbeit: Projekte mit Kunde und
Projektart, wiederverwendbare Vorlagen, Status-Board, Dateiablage, Notiz-Journal
– plus ein Outlook-Add-in, mit dem sich eine Mail an ein Projekt anheften oder
direkt in ein neues Projekt verwandeln lässt.

Läuft komplett lokal in Docker und ist **bewusst ohne Anmeldung** gebaut. Deshalb
gilt: der Proxy wird ausschließlich an `127.0.0.1` gebunden. Nicht ins LAN
exponieren.

---

## Aufbau

| Dienst  | Image        | Aufgabe                                        |
| ------- | ------------ | ---------------------------------------------- |
| `app`   | selbst gebaut | Next.js 15 (App Router) + Prisma               |
| `db`    | postgres:16  | Daten                                          |
| `proxy` | caddy:2      | HTTPS unter `https://pm.localhost`             |

HTTPS ist keine Kür: das neue Outlook lädt Add-in-Seiten nur über HTTPS mit
vertrauenswürdigem Zertifikat, und eine HTTPS-Seite darf kein `http://localhost`
aufrufen. Deshalb Caddy davor und ein mkcert-Zertifikat.

Datenablage:

- Datenbank im Volume `pgdata`
- Dateien im Volume `uploads`, Pfad `<projectId>/<uuid>-<dateiname>`
- Download läuft über `/api/files/<id>`, nicht statisch

---

## Installation

Ein durchgehender Weg von der frischen Windows-Maschine bis zum laufenden Stack
steht in **[INSTALL.md](INSTALL.md)** – inklusive der Stolperstellen (VM-Plattform
und Neustart, Docker in der WSL statt Docker Desktop, BOM in der `.env`).

Die folgenden Abschnitte beschreiben die Bestandteile im Einzelnen.

---

## Voraussetzungen

- **WSL 2** (nicht WSL 1) mit Ubuntu, oder macOS
- Docker Engine + Compose-Plugin
- `mkcert`
- Node 22 nur, wenn außerhalb von Docker entwickelt wird

### WSL 2 unter Windows sicherstellen

```bash
wsl -l -v
```

Steht in der Spalte `VERSION` eine `1`, fehlt die Grundlage für Docker. Meldet
`wsl --status` dagegen „WSL2 kann nicht gestartet werden, da die Virtualisierung
auf diesem Computer nicht aktiviert ist", fehlt die optionale Komponente
*VM-Plattform*:

```bash
wsl.exe --install --no-distribution
```

Der Befehl meldet Erfolg, wirkt aber **erst nach einem Neustart**. Ob die
Virtualisierung in der Firmware überhaupt an ist, verrät vorher:

```bash
powershell -c "(Get-ComputerInfo -Property HyperVisorPresent).HyperVisorPresent"
```

`True` heißt: läuft bereits ein Hypervisor, die Firmware ist also in Ordnung und
es fehlt wirklich nur die Windows-Komponente. Bei `False` führt kein Weg am BIOS
vorbei.

Danach die Distro installieren und, falls sie auf WSL 1 liegt, konvertieren:

```bash
wsl.exe --install -d Ubuntu
wsl.exe --set-version Ubuntu 2
```

### Ohne lokale Administratorrechte

Auf verwalteten Rechnern geht mehr als erwartet – der komplette Stack läuft ohne
Windows-Adminrechte:

- **Docker** wird in der WSL installiert (siehe unten), nicht als Docker
  Desktop. Innerhalb der Distro ist der Standardbenutzer per `sudo` voll
  berechtigt.
- **mkcert** per `winget install --scope user FiloSottile.mkcert`. `mkcert
  -install` schreibt in den *CurrentUser*-Zertifikatspeicher und braucht keine
  erhöhten Rechte, nur eine Bestätigung im Dialog.
- Der **hosts-Eintrag entfällt**. Windows löst `pm.localhost` von sich aus auf –
  nachprüfbar mit `Resolve-DnsName pm.localhost`.

Einzig `wsl --install` selbst kann je nach Richtlinie Adminrechte verlangen.

### Node und Docker in der WSL installieren

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" | sudo tee /etc/apt/sources.list.d/nodesource.list
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt-get update && sudo apt-get install -y nodejs docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
printf '[boot]\nsystemd=true\n' | sudo tee /etc/wsl.conf
```

Anschließend aus Windows `wsl --shutdown` und die Distro neu öffnen, damit
systemd und die Gruppenmitgliedschaft greifen.

---

## Zertifikat

Das Root-Zertifikat muss **unter Windows** im Zertifikatspeicher liegen, denn
Outlook läuft dort – nicht in der WSL.

**1. Unter Windows** (PowerShell, mkcert per `winget install FiloSottile.mkcert`
oder als Binary):

```bash
mkcert -install
```

**2. Zertifikat erzeugen** – im Projektverzeichnis, unter Windows oder in der WSL
(mit derselben CA; `mkcert -CAROOT` zeigt, wo sie liegt):

```bash
mkcert -cert-file certs/pm.localhost.pem -key-file certs/pm.localhost-key.pem pm.localhost
```

**3. Namensauflösung.** Windows löst `*.localhost` inzwischen selbst auf, ein
hosts-Eintrag ist normalerweise überflüssig. Prüfen:

```bash
powershell -c "Resolve-DnsName pm.localhost | Select-Object Name, IPAddress"
```

Kommt nichts zurück, in `C:\Windows\System32\drivers\etc\hosts` (Administrator)
ergänzen:

```
127.0.0.1 pm.localhost
```

Beachten: die Auflösung liefert `::1` **und** `127.0.0.1`, der Proxy ist aber
bewusst nur auf IPv4 gebunden. Clients fallen auf IPv4 zurück, das funktioniert
– bleibt das Taskpane in Outlook trotzdem weiß, ist das die erste Stelle zum
Nachsehen.

---

## Starten

```bash
cp .env.example .env
```

In `.env` ein Passwort für `POSTGRES_PASSWORD` setzen, dann:

```bash
docker compose up -d --build
```

Erreichbar unter <https://pm.localhost>.

Beim ersten Start legt der Container das Schema an und seedet Standard-Tags
sowie die Vorlagen „Exchange-Migration“ und „Intune-Einrichtung“. Der Seed ist
idempotent und läuft bei jedem Start mit.

### Migrationen

Solange `prisma/migrations/` leer ist, wird das Schema per `prisma db push`
synchronisiert. Sobald das Datenmodell steht, wird einmal eine echte Migration
angelegt – ab dann läuft alles über `migrate deploy`.

**Nicht** `docker compose exec app npx prisma migrate dev` benutzen. Das
scheitert aus drei Gründen:

- `/app/prisma` ist kein Bind-Mount. Die Migration landet im
  Container-Dateisystem und ist beim nächsten `docker compose down` weg – im
  Repo kommt sie nie an.
- Der Container läuft als `node`, `/app/prisma` gehört `root`. Schon das
  Anlegen von `prisma/migrations/` scheitert mit *Permission denied*.
- Gegen eine per `db push` angelegte Datenbank erkennt `migrate dev` Drift und
  bietet einen Reset an. Auf einer Instanz mit echten Daten heißt das
  Datenverlust.

Stattdessen die Migration aus dem Schema erzeugen und als bereits angewandt
markieren (Prisma nennt das Baselining). Das ist zerstörungsfrei:

```bash
mkdir -p prisma/migrations/0_init
docker compose exec -T app npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/0_init/migration.sql
```

Danach das Image neu bauen, damit die Migration darin liegt, und den Stand
eintragen, **bevor** der app-Container mit dem neuen Image startet – sonst
versucht `migrate deploy`, die Migration auf bereits bestehende Tabellen
anzuwenden:

```bash
docker compose build app
docker compose run --rm -T --entrypoint sh app -c 'npx prisma migrate resolve --applied 0_init'
docker compose up -d
```

Kontrolle:

```bash
docker compose exec app npx prisma migrate status
```

Erwartet wird „Database schema is up to date!". Ab hier sind spätere
Schemaänderungen normale Migrationen.

---

## Outlook-Add-in

Nur für das **neue Outlook** und OWA. Das klassische Outlook wird nicht bedient.

1. <https://pm.localhost> im Browser öffnen und prüfen, dass das Schloss grün ist.
2. In Outlook: Einstellungen → Allgemein → **Add-Ins verwalten** → *Meine
   Add-Ins* → *Benutzerdefiniertes Add-In* → **Aus Datei hinzufügen** →
   `public/manifest.xml` auswählen (bzw. von
   <https://pm.localhost/manifest.xml> herunterladen).
3. Eine empfangene Mail öffnen → Schaltfläche **Zu Projekt**.

Im Taskpane gibt es zwei Wege:

- **An Projekt anheften** – Projekt suchen, anklicken. Ausgewählte Anhänge
  (PDFs sind vorausgewählt) wandern in die Dateiablage.
- **Neues Projekt** – Name aus dem Betreff, Kunde aus der Absender-Domain,
  beides überschreibbar; dazu Vorlage, Status und Projektart.

Dieselbe Mail zweimal anzuheften erzeugt kein Duplikat: `internetMessageId` ist
eindeutig, ein erneutes Anheften aktualisiert nur die Zuordnung.

Eine über den Reiter *Aufgabe* angelegte Aufgabe **merkt sich ihre Mail**. In der
Aufgabenliste des Projekts steht der Betreff darunter und führt per Deeplink
zurück in Outlook – die Antwort auf „warum gibt es diese Aufgabe eigentlich".
Die Verknüpfung ist `SetNull`, nicht `Cascade`: verschwindet die Mail, bleibt
die Aufgabe stehen und verliert nur den Rückweg.

In der Mail-Liste eines Projekts führt der Betreff über einen Deeplink zurück in
die Originalmail in Outlook.

### Wenn das Taskpane leer bleibt

- Zertifikat: `https://pm.localhost` muss **im Browser** ohne Warnung laden.
  Outlook zeigt sonst nur eine weiße Fläche.
- `mkcert -install` muss unter Windows gelaufen sein, nicht nur in der WSL.
- Manifest geändert? Add-in entfernen und neu hinzufügen – Outlook cacht.

---

## MailDrop – Ablagefenster für die Taskleiste

Wenn das Add-in klemmt oder es schneller gehen soll: `tools/maildrop` enthält ein
kleines Fenster, auf das sich Mails ziehen lassen. Es benutzt dieselben
Endpunkte unter `/api/addin/`, es gibt also keine zweite Fachlogik.

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File tools\maildrop\Verknuepfung-anlegen.ps1
```

Danach im Startmenü „Projektmanager MailDrop" suchen, Rechtsklick → *Weitere* →
*An Taskleiste anheften*. Keine Administratorrechte nötig, alles landet im
Benutzerprofil. Zum Entfernen dasselbe Skript mit `-Entfernen`.

Ablauf: Mail auf die Fläche ziehen, Projekt aus der Liste wählen (die Suche wird
aus der Absenderdomain vorbelegt), dann *An Projekt anheften* oder *Neues Projekt
daraus*. Anhänge wandern mit; per Vorgabe nur PDFs.

Zwei Formate kommen an:

| Herkunft | Format | Anhänge |
| -------- | ------ | ------- |
| Klassisches Outlook, direkt aus dem Fenster gezogen | `.msg` über Outlook-COM | ja |
| `.msg`/`.eml` aus dem Explorer | wie oben bzw. RFC-822 | nur bei `.msg` |
| Neues Outlook, direkt gezogen | `.eml` | **nein** |

Die Einschränkung bei `.eml` ist bewusst: die MIME-Zerlegung mehrteiliger
Nachrichten wäre ein eigenes Stück Software. Wer Anhänge braucht, zieht die Mail
aus dem klassischen Outlook oder legt sie vorher als `.msg` ab.

Ohne `internetMessageId` greift die Idempotenz nicht – das Fenster sagt es
deutlich, wenn eine Mail keine mitbringt.

Andere Adresse als `https://pm.localhost`: `-BaseUrl` beim Anlegen der
Verknüpfung setzen oder `PM_BASE_URL` als Umgebungsvariable.

---

## Aufgabenboard

Beide Tabellen – Projekte wie Aufgaben – **sortieren per Klick auf die
Spaltenüberschrift**, ein zweiter Klick dreht die Richtung. Die Sortierung steht
in der Adresse (`?sort=name&richtung=desc`) und überlebt damit Filtern,
Umschalten und ein Lesezeichen. Sortiert wird in der Seite, nicht in der
Datenbank: der Fortschritt wird gerechnet und existiert dort gar nicht als
Spalte, und so gilt für alle Spalten dieselbe Regel.

Unterhalb von `md` weicht die Projekttabelle Karten – eine Tabelle mit sechs
Spalten auf einem Telefon wäre nur eine Einladung zum Querscrollen.

Unter **Aufgaben** liegt eine **eigenständige Liste**. Sie öffnet als **Tabelle**
– alle Angaben nebeneinander, Status per Auswahl. Wer lieber schiebt, schaltet
auf *Board* um: vier Spalten *Offen · In Arbeit · Wartet · Erledigt*, Ziehen
setzt den Status. Dieselbe Umschaltung gibt es bei den Projekten, auch dort ist
die Tabelle die Vorgabe. Die Wahl steht in der Adresse (`?ansicht=board`), ein
Lesezeichen hält sie also fest.

Der Punkt dieser Liste ist die Trennung: **sie hat mit den Projekten nichts zu
tun.** Was an einem Projekt hängt, lebt in dessen Aufgabenliste und taucht hier
nicht auf – auch nicht im Dashboard-Block *Offene Aufgaben*, der dieselbe Quelle
liest. Gedacht ist die Liste für Zurufe, Kleinkram und alles, was keinen
Projektrahmen hat.

Der Filter dafür steht in der Fachlogik (`listBoardTasks` in `service.ts`), nicht
in der Ansicht. Eine neue Seite kann die Trennung damit nicht versehentlich
aufweichen.

Zwei Dinge unterscheiden Aufgaben von Projekten:

- **„Erledigt" ist ein Status, kein zusätzliches Häkchen.** Es gibt kein
  `done`-Feld mehr – das Kästchen in der Projektansicht schaltet zwischen
  `OFFEN` und `ERLEDIGT` hin und her, mehr nicht. Der Fortschritt zählt weiter
  aus den Aufgaben, jetzt eben über den Status.
- **Eine Aufgabe darf ohne Projekt bestehen.** `Task.projectId` ist nullable –
  die Voraussetzung für die getrennte Liste. Ohne Projekt gibt es folgerichtig
  auch keine Phase; die Fachlogik verwirft eine mitgegebene `phaseId` in dem
  Fall, statt zu scheitern.

Gefiltert wird nur nach Suchbegriff, über Titel und Notiz. Ein Projektfilter
wäre hier gegenstandslos.

Jede Aufgabe hat **Priorität** und optional eine **Fälligkeit**. Sortiert wird
nach Fälligkeit, dann Priorität – was heute fällig ist, ist dringender als was
irgendwann wichtig ist; Undatiertes sortiert sich dahinter ein. Überfälliges
steht rot auf der Karte. Die Fälligkeit ist bewusst etwas anderes als der
geplante Termin: der Termin sagt „dann wird gearbeitet", die Fälligkeit „bis
dann fertig".

### Wiederkehrende Aufgaben

Eine freie Aufgabe kann sich täglich bis jährlich wiederholen. Der Nachfolger
entsteht **beim Abhaken**, nicht durch einen Hintergrunddienst – es läuft nichts,
wenn niemand da ist, und für Wochen mit ausgeschaltetem Rechner stapeln sich
keine Karteileichen. Der Preis: wer nie abhakt, bekommt auch keinen Nachfolger.
Die erledigte Aufgabe bleibt als Beleg stehen.

Grundlage der neuen Fälligkeit ist die alte, damit eine wöchentliche Aufgabe
ihren Wochentag behält, auch wenn spät abgehakt wird. Liegt das Ergebnis noch in
der Vergangenheit, wird im selben Raster weitergezählt, bis es in der Zukunft
liegt – sonst erzeugte das Aufräumen alter Rückstände sofort den nächsten.
Projektaufgaben können sich nicht wiederholen; eine Aufgabe, die sich selbst
nachbildet, würde die Phasenstruktur unterlaufen.

Im Outlook-Add-in gibt es dafür den Reiter **Aufgabe**: Betreff als
Titelvorschlag, Projekt optional, Status wählbar, und ein Haken *Mail an das
Projekt anheften* (vorausgewählt). Ohne Projekt kann die Mail nicht angeheftet
werden – die Antwort sagt das dann auch. Die Projektauswahl entscheidet, wo die
Aufgabe landet: mit Projekt in dessen Liste, ohne Projekt in der eigenständigen
unter *Aufgaben*.

---

## Suche

Unter **Suche** läuft eine Volltextsuche über Projekte, Notizen und Aufgaben –
Postgres-eigen, mit dem Wörterbuch `german`. „Migration" findet damit auch
„Migrationen", und die Rangfolge kommt aus der Datenbank statt aus einer
selbstgebauten Heuristik. Mehrere Wörter werden verundet, `"in Anführungszeichen"`
sucht die Wortfolge, `-wort` schließt aus (`websearch_to_tsquery`).

Die `tsvector`-Spalten sind **generiert**, Postgres hält sie also selbst aktuell;
es gibt keinen Trigger und keinen zweiten Ort, der vergessen werden könnte. Sie
stehen nur in der Migration, nicht im Prisma-Schema – abgefragt wird über
`$queryRaw`.

Archiviertes ist absichtlich dabei und als solches gekennzeichnet: „Archivieren
statt Löschen" wäre sonst die Hälfte wert.

Die Fundstellen im Auszug werden **nicht** von `ts_headline` ausgezeichnet.
Dessen `<b>` käme mit dem übrigen HTML aus den Daten mit – eine Notiz mit
`<script>` landete ausführbar in der Seite. Stattdessen setzt Postgres eigene
Marken, der Text wird escaped, und erst danach werden die Marken zu `<b>`.

---

## Kalender und Termine

Projekte, Phasen und Aufgaben können einen **geplanten Termin von–bis** haben –
gedacht für Migrationsfenster, Vor-Ort-Einsätze und Cutover-Nächte. Gesetzt wird
er dort, wo das Objekt lebt:

| Ebene   | Wo                                           |
| ------- | -------------------------------------------- |
| Projekt | Projekt → Einstellungen → *Geplanter Termin*  |
| Phase   | Projekt → Aufgaben → *Termin setzen* an der Phase |
| Aufgabe | Projekt → Aufgaben → *Termin setzen* an der Zeile |

Beide Felder leeren und speichern entfernt den Termin wieder. Ein halber Termin
wird abgelehnt – siehe unten unter den Entscheidungen.

Die Ansicht unter **Kalender** zeigt einen Monat, Montag bis Sonntag. Blöcke über
mehrere Tage erscheinen in jedem betroffenen Tag, mit Uhrzeit am Start- und
Endtag. Darunter steht der Monat noch einmal als Liste. Das Dashboard zeigt unter
*Was als Nächstes ansteht* die nächsten sechs offenen Termine.

Archivierte Projekte tauchen im Kalender nicht auf.

### Zeitzone

Termine werden als **Ortszeit ohne Offset** eingegeben (`datetime-local`).
Deshalb setzt `docker-compose.yml` `TZ` auf `Europe/Berlin` – ohne das liefe der
Container auf UTC und aus 22:00 würde beim Anzeigen 20:00. Wer woanders sitzt,
setzt `TZ` in der `.env`.

---

## Gestaltung nach Apples Vorbild

Die Oberfläche folgt der Systemgestaltung von Apple – nicht als Nachbau
einzelner Fenster, sondern über die Größen, an denen es hängt:

- **Farben nach Bedeutung, nicht nach Nummer.** Apple staffelt Flächen
  (`systemBackground` → `secondary` → `tertiary`), Schrift (`label` →
  `secondaryLabel` → `tertiaryLabel`) und Trenner. Diese Staffelung liegt auf
  der vorhandenen Slate-Reihe, deshalb erbt sie jede bestehende Klasse. Hell ist
  die Seite grau und die Karte weiß, dunkel andersherum.
- **Ein Blau.** `#0071E3` – das von apple.com, nicht `systemBlue #007AFF`: auf
  systemBlue kommt weiße Schrift nur auf 3,7:1. Verweise tragen dasselbe Blau,
  kein zweites.
- **Schrift.** `-apple-system` holt auf einem Mac die San Francisco, sonst
  greift die Systemschrift. Eine Schriftdatei mitzuliefern wäre der falsche
  Preis: die App läuft ohne Netz, und SF ist außerhalb von Apples Plattformen
  nicht lizenziert. Übernommen ist der Satz: offenere Zeilen, und je größer die
  Schrift, desto enger die Laufweite.
- **Formen.** Knöpfe und Umschalter sind Kapseln, Karten haben große Radien.
  Wo der Browser `corner-shape: squircle` kennt, werden daraus Superellipsen –
  Apples Ecken sind keine Kreisbögen.

**Eine Abweichung ist Absicht.** Apples `secondaryLabel` und `tertiaryLabel`
liegen unter 4,5:1; Apple nimmt das hin, hier sind die Textstufen eine Spur
dunkler. Die Flächen sind es nicht. Nachgemessen über sechs Seiten in beiden
Schemata: 1498 Textelemente, keine Beanstandung.

---

## Glasmaterial

Die Bedienebene benutzt ein Material nach Apples *Liquid Glass*: Seitenleiste,
die schwebende Leiste auf schmalen Geräten, die klebenden Seitenköpfe und die
Kopfzeile der Tabellen. Drei Regeln aus Apples Vorgabe halten das im Rahmen:

1. **Glas liegt nur auf der Bedienebene.** Karten, Tabellen und Formulare
   bleiben deckend – Inhalt muss lesbar sein, nicht schweben.
2. **Kein Glas auf Glas.** Wo zwei Ebenen aufeinandertreffen, bekommt nur die
   obere das Material; die aktive Pille in der Navigation ist deckend.
3. **Sparsam.** Sichtbar wird der Effekt ohnehin nur dort, wo tatsächlich etwas
   darunter durchläuft – deshalb sind alle Träger klebend oder schwebend.

Was Glas als Glas lesbar macht, ist nicht der Weichzeichner, sondern die helle
Kante oben (`inset 0 1px 0`). Der Schatten ist nur Beiwerk.

**Barrierefreiheit.** `prefers-reduced-transparency: reduce` schaltet auf
deckende Flächen um – ohne Weichzeichner, nicht bloß mit mehr Deckkraft. Bei
`prefers-contrast: more` trägt der Rand statt des Lichts. Kontrolliert ist der
Kontrast in beiden Schemata über alle Listen: keine Beanstandung.

Knöpfe sind Kapseln, ebenso die Umschalter zwischen Tabelle und Board. Das ist
die auffälligste Anleihe – und die einzige, die ohne Material auskommt.

---

## Dunkles Farbschema

Unten in der Navigation steht ein Schalter, der im Kreis zwischen **System**,
**Hell** und **Dunkel** wechselt. Die Auswahl liegt im `localStorage` des
Browsers (`pm-theme`), nicht in der Datenbank: sie hängt am Gerät, nicht an den
Daten, und ohne Anmeldung gäbe es auch niemanden, an dem sie hängen könnte. Bei
*System* folgt die App `prefers-color-scheme` und reagiert auf einen Wechsel im
laufenden Betrieb. Das Outlook-Taskpane zieht mit.

Umgesetzt ist das **nicht** über `dark:`-Varianten an jeder Klasse, sondern über
die Palette selbst. Tailwind v4 übersetzt jede Farb-Utility in eine Variable –
`.text-slate-500` wird zu `color:var(--color-slate-500)`. In `globals.css` hängt
`.dark` diese Variablen um: die neutralen Stufen auf eine von Hand gesetzte
dunkle Reihe, die Buntstufen gespiegelt (100↔900, 200↔800, 300↔700, 400↔600,
500 bleibt).

Das fällt mit dem Aufbau der Statusfarben zusammen. Ein Badge ist überall
`bg-*-100 text-*-800 ring-*-300`; gespiegelt wird daraus von selbst dunkle
Fläche mit heller Schrift, ohne dass `status.ts` etwas davon wissen muss.

Zwei Dinge laufen unter der Spiegelung in die Irre. Ein **gefüllter Knopf** wäre
plötzlich eine helle Fläche, deshalb hängt er nicht an `bg-blue-600`, sondern an
den Token `bg-akzent` / `text-akzent-auf` / `hover:bg-akzent-stark`, die in
beiden Schemata denselben Wert haben. Und der **Codeblock** im Notiz-Journal ist
schon im hellen Schema dunkel – gespiegelt würde er zur hellen Insel, also steht
er auf festen Werten.

Ein Inline-Skript im Root-Layout setzt die Klasse `.dark` vor dem ersten
Zeichnen. Ohne das blitzt beim Laden kurz das helle Schema auf, weil React erst
später übernimmt – deshalb steht am `<html>` auch `suppressHydrationWarning`.

---

## Sicherung

```bash
./scripts/backup.sh
```

Legt `db-<zeitstempel>.sql.gz` und `uploads-<zeitstempel>.tar.gz` in `./backups`
ab und räumt Sicherungen älter als 30 Tage weg (`BACKUP_KEEP` überschreibt das).

**`BACKUP_MIRROR` in der `.env` setzen.** Ohne das liegt die Sicherung in
derselben WSL-Distribution wie die Volumes – auf derselben Platte, hinter
derselben `wsl --unregister`. Sie schützt dann gegen Fehlbedienung, nicht gegen
Verlust. Sinnvoll ist ein Pfad unter `/mnt/c` in einem Ordner, der vom Rechner
weg synchronisiert wird:

```bash
BACKUP_MIRROR="/mnt/c/Users/DEINNAME/OneDrive/projektmanager-backups"
```

Ist das Ziel nicht erreichbar, bricht das Skript ab, statt still nur lokal zu
sichern. Die Kopie altert nach denselben Regeln wie das Original.

Per Cron in der WSL, zweimal täglich – ein ausgeschalteter Rechner kostet so
nicht gleich einen ganzen Tag:

```bash
crontab -e
# 0 12,20 * * * cd /pfad/zum/projektmanager && ./scripts/backup.sh >> backups/backup.log 2>&1
```

Zurückspielen:

```bash
./scripts/restore.sh backups/db-20260730-200000.sql.gz backups/uploads-20260730-200000.tar.gz
```

`restore.sh` legt vorher selbst einen Dump nach `backups/pre-restore-<zeitstempel>.sql.gz`.
Das ist kein Zierrat: der Dump enthält `--clean`, das Einspielen wirft also
alles weg, was seit der Sicherung entstanden ist. Ohne den Schnappschuss ließe
sich hinterher nicht einmal feststellen, was gefehlt hat.

### Wachhund

```bash
./scripts/watchdog.sh
```

Startet Container neu, die Docker als `unhealthy` meldet. Der Umweg ist nötig,
weil Docker den `HEALTHCHECK` zwar auswertet, aber keine Konsequenz daraus
zieht: `restart: unless-stopped` greift nur, wenn der Prozess *endet*. Ein
hängender Node-Prozess läuft weiter und der Proxy liefert 502, bis jemand
hinschaut. Per Cron alle fünf Minuten:

```bash
# */5 * * * * cd /pfad/zum/projektmanager && ./scripts/watchdog.sh >> backups/watchdog.log 2>&1
```

Der Healthcheck der App prüft bis zur Datenbank durch (`/api/health`) – ein
Prozess, der nur noch HTML ausliefert, aber keine Verbindung mehr bekommt, ist
für diese App nutzlos.

---

## Tests

```bash
./scripts/test.sh
```

Läuft in einem Node-Container am Compose-Netz, gegen eine eigene Datenbank
`pm_test` neben der produktiven – die Tests leeren Tabellen, die Trennung ist
also nicht optional. Node muss dafür nicht auf dem Host installiert sein.

Geprüft wird die Fachlogik, nicht die Oberfläche: die Trennung von freien und
Projektaufgaben, das Kopieren der Vorlagen, der gerechnete Fortschritt, die
Idempotenz beim Anheften, das Kaskadenlöschen, die Wiederholungsrechnung und
dass die Volltextsuche HTML aus den Daten entschärft.

Dieselben Schritte laufen bei jedem Push über GitHub Actions
(`.github/workflows/ci.yml`), dort zusätzlich `tsc --noEmit` und der Build.

---

## Bekannte Fallstricke

**`.env` unter Windows ohne BOM schreiben.** `Out-File -Encoding utf8` schreibt
in Windows PowerShell 5.1 ein UTF-8-BOM. Compose liest die erste Variable dann
als `﻿POSTGRES_USER` und der Wert fehlt. Prüfen:

```bash
powershell -c "'{0:X2}' -f [System.IO.File]::ReadAllBytes('.env')[0]"
```

`EF` heißt BOM vorhanden. In PowerShell 7 oder mit
`[System.IO.File]::WriteAllText` schreiben, dann tritt das nicht auf.

**Die Grenzen für Anhänge sind nicht deckungsgleich.** `MAX_UPLOAD_BYTES` in
`src/lib/validation.ts` sind 32 MB *entschlüsselt*, das Add-in schickt Anhänge
aber als Base64 (+33 %), und Caddys `request_body max_size` greift auf den
**rohen** Body. Über das Add-in liegt die tatsächliche Obergrenze damit bei rund
24 MB, nicht bei 32. Für Auftrags-PDFs irrelevant; wer die vollen 32 MB will,
setzt Caddy auf `44MB`.

**Der Stack wird aus der WSL bedient.** Liegt das Repo im Windows-Dateisystem
und der Daemon in der Distro, gibt es unter Windows keinen `docker`-Befehl:

```bash
wsl -d Ubuntu -- bash -c 'cd /mnt/c/pfad/zum/projektmanager && docker compose ps'
```

Für alles Mehrzeilige besser ein Skript ablegen und mit `wsl -d Ubuntu -- bash
/mnt/c/...` starten – das Quoting von PowerShell nach bash zerlegt sonst jedes
Kommando mit Klammern oder Anführungszeichen.

**Lockdatei und Zeilenenden sind kein Problem.** `npm ci` mit einer auf arm64
erzeugten `package-lock.json` läuft auf x64 durch, und CRLF fängt
`.gitattributes` mit `eol=lf` bereits ab.

---

## Entwicklung ohne Docker

```bash
npm install
docker compose up -d db
# DATABASE_URL und UPLOAD_DIR in .env setzen (siehe .env.example)
npx prisma migrate dev
npm run db:seed
npm run dev
```

Das Add-in braucht auch hier HTTPS – für Add-in-Arbeit lieber den vollen
Compose-Stack starten.

---

## Entscheidungen, die im Code sichtbar sind

- **Vorlagen werden kopiert, nicht referenziert.** Beim Anlegen wandern Phasen
  und Aufgaben als Kopie ins Projekt. Dasselbe gilt für die einzelne Phase, die
  sich über *Einzelne Phase … → Einsetzen* mitten im Projekt anhängen lässt –
  der häufige Fall, wenn die Nacharbeit dazukommt, aber nicht noch einmal die
  ganze Vorlage. Ändert sich die Vorlage später, bleiben
  laufende Projekte unberührt. `Project.templateId` ist nur ein Herkunftsvermerk.
- **Fortschritt wird gerechnet, nicht gespeichert** – aus erledigten zu gesamten
  Aufgaben. Ein eigenes Feld könnte auseinanderlaufen. Aus demselben Grund
  ersetzt `Task.status` das frühere `done`: zwei Wahrheiten über denselben
  Sachverhalt laufen irgendwann auseinander, also gibt es nur eine.
- **Archivieren statt Löschen.** Abgeschlossenes verschwindet aus der Übersicht,
  bleibt aber auffindbar. Löschen gibt es, ist aber der Ausnahmefall.
- **Statuswechsel werden protokolliert** (`StatusEvent`), sichtbar unter
  Projekt → Einstellungen. Damit ist „wie lange hängt das schon?“ beantwortbar.
- **Kein Graph-Zugriff.** Alles, was das Add-in braucht, liefert Office.js lokal.
  Keine App-Registrierung, keine Tokens, keine Admin-Zustimmung.
- **Kunde ist ein Textfeld mit Autocomplete**, keine eigene Entität – aber die
  Vorschlagsliste verhindert „Müller GmbH“ neben „Mueller GmbH“.

- **Termine sind ganz oder gar nicht.** Ein Termin besteht aus Beginn *und*
  Ende. Nur einen Beginn zu speichern wäre im Kalender nicht darstellbar, also
  lehnt die Validierung das ab, statt stillschweigend etwas zu ergänzen.
- **Termine liegen auf drei Ebenen und erben nichts.** Projekt, Phase und
  Aufgabe haben je einen eigenen Termin. Es gibt bewusst keine Ableitung „Phase
  = früheste Aufgabe": zwei Wahrheiten, die auseinanderlaufen können, sind
  schlimmer als eine, die man selbst pflegt.

Bewusst nicht enthalten: Zeiterfassung (also erfasste Stunden und Abrechnung),
Kundenverwaltung als Entität, Postfach-Sync über Graph, Login.
