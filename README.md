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

## Voraussetzungen

- **WSL 2** (nicht WSL 1) mit Ubuntu, oder macOS
- Docker Engine + Compose-Plugin
- `mkcert`
- Node 22 nur, wenn außerhalb von Docker entwickelt wird

### WSL 2 unter Windows sicherstellen

```bash
wsl -l -v
```

Steht in der Spalte `VERSION` eine `1`, fehlt die Grundlage für Docker. In einer
**als Administrator gestarteten** PowerShell:

```bash
wsl.exe --install --no-distribution
```

Danach Windows neu starten und die Distro konvertieren:

```bash
wsl.exe --set-version Ubuntu 2
```

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

**3. Namensauflösung.** Chromium löst `*.localhost` selbst auf, aber verlassen
sollte man sich nicht darauf. In `C:\Windows\System32\drivers\etc\hosts`
(Administrator) ergänzen:

```
127.0.0.1 pm.localhost
```

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
synchronisiert. Sobald das Datenmodell steht, einmal eine echte Migration
erzeugen – ab dann läuft alles über `migrate deploy`:

```bash
docker compose exec app npx prisma migrate dev --name init
```

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

In der Mail-Liste eines Projekts führt der Betreff über einen Deeplink zurück in
die Originalmail in Outlook.

### Wenn das Taskpane leer bleibt

- Zertifikat: `https://pm.localhost` muss **im Browser** ohne Warnung laden.
  Outlook zeigt sonst nur eine weiße Fläche.
- `mkcert -install` muss unter Windows gelaufen sein, nicht nur in der WSL.
- Manifest geändert? Add-in entfernen und neu hinzufügen – Outlook cacht.

---

## Sicherung

```bash
./scripts/backup.sh
```

Legt `db-<zeitstempel>.sql.gz` und `uploads-<zeitstempel>.tar.gz` in `./backups`
ab und räumt Sicherungen älter als 30 Tage weg (`BACKUP_KEEP` überschreibt das).

Täglich per Cron in der WSL:

```bash
crontab -e
# 0 20 * * * cd /pfad/zum/projektmanager && ./scripts/backup.sh >> backups/backup.log 2>&1
```

Zurückspielen:

```bash
./scripts/restore.sh backups/db-20260730-200000.sql.gz backups/uploads-20260730-200000.tar.gz
```

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
  und Aufgaben als Kopie ins Projekt. Ändert sich die Vorlage später, bleiben
  laufende Projekte unberührt. `Project.templateId` ist nur ein Herkunftsvermerk.
- **Fortschritt wird gerechnet, nicht gespeichert** – aus erledigten zu gesamten
  Aufgaben. Ein eigenes Feld könnte auseinanderlaufen.
- **Archivieren statt Löschen.** Abgeschlossenes verschwindet aus der Übersicht,
  bleibt aber auffindbar. Löschen gibt es, ist aber der Ausnahmefall.
- **Statuswechsel werden protokolliert** (`StatusEvent`), sichtbar unter
  Projekt → Einstellungen. Damit ist „wie lange hängt das schon?“ beantwortbar.
- **Kein Graph-Zugriff.** Alles, was das Add-in braucht, liefert Office.js lokal.
  Keine App-Registrierung, keine Tokens, keine Admin-Zustimmung.
- **Kunde ist ein Textfeld mit Autocomplete**, keine eigene Entität – aber die
  Vorschlagsliste verhindert „Müller GmbH“ neben „Mueller GmbH“.

Bewusst nicht enthalten: Zeiterfassung, Deadlines/Meilensteine, Kundenverwaltung
als Entität, Postfach-Sync über Graph, Login.
