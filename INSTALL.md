# Installation unter Windows

Durchgehender Weg von einer frischen Windows-Maschine bis zum laufenden Stack.
Getestet auf Windows 11 Enterprise **ohne lokale Administratorrechte** – bis auf
eine Ausnahme in Schritt 1 geht alles im Benutzerkontext.

Wer schon Docker und WSL 2 hat, springt zu [Schritt 4](#4-repository-holen).

Kurzfassung der Begriffe: `app` ist Next.js, `db` ist PostgreSQL, `proxy` ist
Caddy und macht das HTTPS. Alles läuft in Docker; Docker wiederum läuft **in der
WSL**, nicht als Docker Desktop.

---

## 1. WSL 2 einsatzbereit machen

```bash
wsl --status
```

Meldet der Befehl *„WSL2 kann nicht gestartet werden, da die Virtualisierung auf
diesem Computer nicht aktiviert ist"*, fehlt die Windows-Komponente
**VM-Plattform**. Vorher prüfen, ob die Firmware überhaupt mitspielt:

```bash
powershell -c "(Get-ComputerInfo -Property HyperVisorPresent).HyperVisorPresent"
```

- `True` – es läuft bereits ein Hypervisor, die Firmware ist in Ordnung. Weiter.
- `False` – Virtualisierung ist im BIOS/UEFI aus. Da führt kein Weg dran vorbei.

Komponente aktivieren:

```bash
wsl.exe --install --no-distribution
```

> **Der Befehl meldet Erfolg, wirkt aber erst nach einem Neustart.** Ob einer
> aussteht, verrät:
> `powershell -c "Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending'"`

Nach dem Neustart die Distribution installieren:

```bash
wsl.exe --install -d Ubuntu
```

Beim ersten Start legt Ubuntu einen Benutzer an. Dessen Passwort ist **nicht**
das Windows-Passwort und wird nur für `sudo` innerhalb der Distribution
gebraucht.

Kontrolle – in der Spalte `VERSION` muss eine `2` stehen:

```bash
wsl -l -v
```

---

## 2. Docker und Node in der WSL installieren

Bewusst **nicht** Docker Desktop: dessen Installer braucht Administratorrechte.
Innerhalb der Distribution ist der Standardbenutzer per `sudo` ohnehin voll
berechtigt.

Ubuntu-Terminal öffnen und den Block am Stück ausführen:

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" | sudo tee /etc/apt/sources.list.d/nodesource.list
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt-get update
sudo apt-get install -y nodejs docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
printf '[boot]\nsystemd=true\n' | sudo tee /etc/wsl.conf
```

Danach **aus Windows heraus** die Distribution durchstarten, damit systemd und
die neue Gruppenmitgliedschaft greifen:

```bash
wsl --shutdown
```

Ubuntu neu öffnen und prüfen:

```bash
docker compose version && systemctl is-active docker
```

Erwartet: eine Versionsnummer und `active`.

---

## 3. mkcert installieren und Root-Zertifikat anlegen

Das Root-Zertifikat muss **unter Windows** liegen, nicht in der WSL – Outlook und
der Browser laufen dort.

```bash
winget install --scope user FiloSottile.mkcert
```

Neue PowerShell öffnen (der Pfad wird erst dann gefunden), dann:

```bash
mkcert -install
```

Windows zeigt eine Sicherheitswarnung mit dem Fingerabdruck. Bestätigen. Das
schreibt in den *CurrentUser*-Speicher und braucht keine erhöhten Rechte.

---

## 4. Repository holen

Das Repo kann im Windows-Dateisystem liegen; Docker greift über `/mnt/c` darauf
zu. Das ist bequem zum Bearbeiten, macht die Builds aber spürbar langsamer. Wer
oft baut, legt es besser innerhalb der WSL ab (`~/projektmanager`).

```bash
git clone https://github.com/heberlej/projektmanager.git
cd projektmanager
```

---

## 5. Zertifikat für pm.localhost erzeugen

Im Projektverzeichnis, **unter Windows**:

```bash
mkcert -cert-file certs/pm.localhost.pem -key-file certs/pm.localhost-key.pem pm.localhost
```

Namensauflösung prüfen:

```bash
powershell -c "Resolve-DnsName pm.localhost | Select-Object Name, IPAddress"
```

Windows löst `*.localhost` in der Regel selbst auf. Kommt nichts zurück, in
`C:\Windows\System32\drivers\etc\hosts` (Administrator) ergänzen:

```
127.0.0.1 pm.localhost
```

---

## 6. Konfiguration anlegen

```bash
cp .env.example .env
```

In `.env` ein eigenes `POSTGRES_PASSWORD` eintragen.

> **Falle unter Windows:** `Out-File -Encoding utf8` schreibt in Windows
> PowerShell 5.1 ein UTF-8-BOM an den Dateianfang. Compose liest die erste
> Variable dann als `﻿POSTGRES_USER` und der Wert fehlt. Prüfen:
>
> ```bash
> powershell -c "'{0:X2}' -f [System.IO.File]::ReadAllBytes('.env')[0]"
> ```
>
> `EF` heißt BOM vorhanden. Dann mit einem Editor ohne BOM neu speichern.

---

## 7. Stack starten

Alle `docker`-Befehle laufen **in der WSL**. Unter Windows gibt es keinen
`docker`-Befehl:

```bash
wsl -d Ubuntu -- bash -c 'cd /mnt/c/pfad/zum/projektmanager && docker compose up -d --build'
```

Der erste Build dauert je nach Maschine fünf bis zehn Minuten. Beim Start legt
der Container das Schema an und seedet Standard-Tags sowie die Vorlagen
*Exchange-Migration* und *Intune-Einrichtung*. Der Seed ist idempotent.

Für alles Mehrzeilige besser ein Skript ablegen und mit
`wsl -d Ubuntu -- bash /mnt/c/...` starten – das Quoting von PowerShell nach bash
zerlegt sonst zuverlässig jedes Kommando mit Klammern oder Anführungszeichen.

---

## 8. Prüfen, ob alles steht

```bash
wsl -d Ubuntu -- bash -c 'cd /mnt/c/pfad/zum/projektmanager && docker compose ps'
```

Alle drei Dienste müssen `Up` sein, `db` zusätzlich `healthy`.

| Prüfung | Erwartung |
| ------- | --------- |
| <https://pm.localhost> im Browser | lädt, Schloss ohne Warnung |
| Seite *Vorlagen* | zwei Vorlagen vorhanden |
| Neues Projekt aus Vorlage *Exchange-Migration* | 4 Phasen, 19 Aufgaben |
| Seiten *Aufgaben* und *Kalender* | erreichbar |

Ein Fehlschlag beim Zertifikat sieht so aus: Der Browser warnt. Dann ist
`mkcert -install` nicht unter Windows gelaufen, sondern nur in der WSL.

---

## 9. Migrationen scharf schalten

Beim allerersten Start wird das Schema per `prisma db push` angelegt, solange
`prisma/migrations/` leer ist. Seit dem Commit *Kalender, Aufgabenboard und
Migrations-Baseline* liegen Migrationen im Repo, der Entrypoint nimmt also
automatisch `migrate deploy`. Kontrolle:

```bash
wsl -d Ubuntu -- bash -c 'cd /mnt/c/pfad/zum/projektmanager && docker compose exec app npx prisma migrate status'
```

Erwartet: *Database schema is up to date!*

**Nicht** `prisma migrate dev` im Container aufrufen – warum das dreifach
scheitert, steht in der [README](README.md#migrationen).

---

## 9a. Bestehende Installation aktualisieren

Wer den Stack schon vor den Migrationen laufen hatte, **darf nicht einfach
`git pull` und `docker compose up -d` machen.** Das Schema wurde damals per
`prisma db push` angelegt, es gibt also keine Tabelle `_prisma_migrations`. Der
Entrypoint findet jetzt Migrationen, ruft `migrate deploy` auf, und das versucht
`0_init` auf bereits bestehende Tabellen anzuwenden – Fehlschlag mit
*relation already exists*, der Container kommt nicht hoch.

### Wenn noch keine Daten drin sind: neu aufsetzen

Der einfachste Weg. `-v` wirft die Volumes weg, danach laufen die Migrationen
auf einer leeren Datenbank sauber von vorn durch und der Seed legt Tags und
Vorlagen neu an:

```bash
git pull
docker compose down -v
docker compose up -d --build
```

> **`down -v` löscht alle Daten und alle hochgeladenen Dateien.** Ohne das `-v`
> bleiben die Volumes stehen – dann gilt der Abschnitt darunter.

### Wenn Daten erhalten bleiben sollen

Erst bauen, dann den Stand eintragen, **dann** starten:

```bash
git pull
docker compose build app
docker compose run --rm -T --entrypoint sh app -c 'npx prisma migrate resolve --applied 0_init'
docker compose up -d
```

Der dritte Befehl markiert nur den Ist-Zustand als erledigt, ohne etwas
auszuführen. Danach wendet der Entrypoint die beiden neueren Migrationen an –
darunter der Umbau von `Task.done` auf `Task.status`, der die erledigten
Aufgaben überträgt.

Kontrolle:

```bash
docker compose exec app npx prisma migrate status
docker compose exec -T db psql -U pm -d pm -c 'SELECT status, count(*) FROM "Task" GROUP BY status;'
```

Erwartet: *Database schema is up to date!* und eine Verteilung, in der die
früher erledigten Aufgaben als `ERLEDIGT` auftauchen.

Wer lieber auf Nummer sicher geht, sichert vorher:

```bash
./scripts/backup.sh
```

---

## 10. Outlook-Add-in einrichten (optional)

Nur für das **neue Outlook** und OWA.

1. <https://pm.localhost> im Browser öffnen und prüfen, dass das Schloss grün ist.
   Ohne das zeigt Outlook nur eine weiße Fläche.
2. Outlook → Einstellungen → Allgemein → **Add-Ins verwalten** → *Meine Add-Ins*
   → *Benutzerdefiniertes Add-In* → **Aus Datei hinzufügen** → `public/manifest.xml`
3. Eine Mail öffnen. Die Schaltfläche **Zu Projekt** liegt im neuen Outlook unter
   **„Apps"** oder unter *Weitere Aktionen* (drei Punkte) – nicht zwingend im
   Menüband.

Fehlt der Menüpunkt *Benutzerdefiniertes Add-In* ganz, sperrt eine
Tenant-Richtlinie das Sideloading. Dann führt nur die Bereitstellung über das
Microsoft-365-Admin-Center weiter.

---

## 11. MailDrop einrichten (optional)

Ablagefenster für die Taskleiste, als Ergänzung oder Ersatz zum Add-in:

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File tools\maildrop\Verknuepfung-anlegen.ps1
```

Startmenü → „Projektmanager MailDrop" → Rechtsklick → *Weitere* → *An Taskleiste
anheften*. Details in der [README](README.md#maildrop--ablagefenster-für-die-taskleiste).

---

## 12. Sicherung einrichten

```bash
./scripts/backup.sh
```

Legt `db-<zeitstempel>.sql.gz` und `uploads-<zeitstempel>.tar.gz` in `./backups`
ab. Täglich per Cron in der WSL:

```bash
crontab -e
# 0 20 * * * cd /pfad/zum/projektmanager && ./scripts/backup.sh >> backups/backup.log 2>&1
```

---

## Wenn etwas klemmt

| Symptom | Ursache |
| ------- | ------- |
| `docker: command not found` unter Windows | Docker läuft in der WSL. Befehle mit `wsl -d Ubuntu -- bash -c '...'` absetzen. |
| Compose meldet fehlendes `POSTGRES_PASSWORD` | BOM in der `.env`, siehe Schritt 6. |
| Browser warnt vor dem Zertifikat | `mkcert -install` lief nicht unter Windows. |
| Taskpane in Outlook bleibt weiß | Zertifikat, oder `pm.localhost` löst nur auf `::1` auf – der Proxy lauscht bewusst nur auf IPv4. |
| Add-in installiert, aber kein Knopf | Im neuen Outlook unter „Apps" oder *Weitere Aktionen* nachsehen. |
| Build dauert sehr lange | Repo liegt unter `/mnt/c`; WSL greift über drvfs zu. Repo in die WSL verschieben hilft deutlich. |
| Manifest geändert, nichts passiert | Outlook cacht. Add-in entfernen, Outlook schließen, neu hinzufügen. |

Zum Zurückspielen einer Sicherung:

```bash
./scripts/restore.sh backups/db-20260731-200000.sql.gz backups/uploads-20260731-200000.tar.gz
```
