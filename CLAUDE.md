# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Code, Kommentare und Doku sind auf Deutsch. Bitte dabei bleiben.

## Wo was läuft

Die Anwendung gibt es in **zwei Fassungen aus einer Codebasis**:

| | |
| --- | --- |
| **Docker/WSL** | Next.js + Postgres + Caddy in `docker-compose.yml`, erreichbar über `https://pm.localhost`. Die produktive Installation liegt in der WSL unter `~/projektmanager` – **nicht** in diesem Ordner. |
| **Windows** | Electron mit mitgeliefertem Postgres, alles unter `desktop/`. Siehe `desktop/ARCHITEKTUR.md`. |

Es gibt **drei Arbeitskopien** desselben Repositorys, jede mit einer Aufgabe:

| Ort | wofür |
| --- | --- |
| `~/projektmanager` (WSL) | die laufende Docker-Installation, hier laufen die Tests |
| `C:\Users\jahe\projektmanager` | **der Bau-Arbeitsbaum der Windows-Fassung** |
| `…\OneDrive\…\windowsapp\WSL` | Ablage und Git-Fernzugriff; hier **nicht** bauen |

Änderungen an einer Kopie wirken in den anderen erst, wenn sie dort ankommen –
über Git oder schlicht kopiert.

**In OneDrive wird nicht gebaut.** `next build` lief dort über zwanzig Minuten,
ohne eine einzige Datei nach `.next` zu schreiben; derselbe Build unter
`C:\Users\jahe\projektmanager` braucht **neunzehn Sekunden**. Dieselbe Ursache
hatte vorher schon das Entpacken der Postgres-Binärdateien zerlegt. Der fertige
Installer wird nach OneDrive kopiert, sonst nichts – kein `node_modules`, kein
`.next`.

**Node liegt nicht auf dem Host.** Alles läuft über Container oder ein portables
Node unter `desktop/.werkzeug/`.

## Befehle

```bash
# Stack bauen und starten (Docker-Fassung)
wsl -d Ubuntu -- bash -c "cd ~/projektmanager && docker compose up -d --build"
```

```bash
# Tests + Typprüfung, in einem Container gegen die Datenbank pm_test
wsl -d Ubuntu -- bash -c "cd ~/projektmanager && ./scripts/test.sh"
```

```bash
# Einzelner Test - Argumente gehen an vitest durch
wsl -d Ubuntu -- bash -c "cd ~/projektmanager && ./scripts/test.sh tests/aufgaben.test.ts -t 'Nachfolger'"
```

`scripts/test.sh` fährt `prisma generate`, `migrate deploy`, `tsc --noEmit` und
dann vitest – dieselbe Reihenfolge wie die CI. `npm test` allein prüft **keine
Typen**; ein Fehler fällt sonst erst auf GitHub auf.

Windows-Installer bauen – **in `C:\Users\jahe\projektmanager`**, nicht in
OneDrive. Erst die Anwendung, dann die Hülle:

```bash
powershell -Command "$env:Path = 'C:\Users\jahe\projektmanager\desktop\.werkzeug\node-v22.11.0-win-x64;' + $env:Path; Set-Location C:\Users\jahe\projektmanager; npm run build"
```

```bash
powershell -ExecutionPolicy Bypass -File C:\Users\jahe\projektmanager\desktop\scripts\zusammenbauen.ps1
```

Der erste Schritt dauert eine gute Minute, der zweite einige. Das Ergebnis liegt
unter `%LOCALAPPDATA%\projektmanager-bau\dist\`.

## Aufbau

- `src/lib/service.ts` – **die Fachlogik.** Wird von den Server Actions *und*
  den Add-in-Routen unter `/api/addin` benutzt. Regeln gehören hierher, nicht in
  die Ansicht.
- `src/lib/actions.ts` – Server Actions (`"use server"`), dünn: parsen,
  `service.ts` rufen, `revalidatePath`.
- `src/lib/validation.ts` – einzige Validierungsquelle (zod), von UI und Add-in
  gemeinsam benutzt.
- `src/app/(app)/` – die Oberfläche, `src/app/addin/` – das Outlook-Taskpane
  ohne Rahmen.

## Entscheidungen, die man kennen muss

**Farben hängen an CSS-Variablen, nicht an `dark:`-Klassen.** Tailwind v4
übersetzt jede Farb-Utility in `var(--color-…)`. Das dunkle Schema und die
Apple-Palette hängen deshalb komplett in `globals.css`: `.dark` biegt die
Variablen um, die Buntstufen sind gespiegelt (100↔900, 500 bleibt). **Wer eine
Farbe ändern will, ändert sie dort – nicht in 32 Komponenten.** Wo die
Spiegelung in die Irre liefe (gefüllte Knöpfe, Statuspunkte), gibt es eigene
Token (`--color-akzent`, `--color-status-*`, `--color-erledigt`).

**Freie Aufgaben und Projektaufgaben sind getrennte Welten.** `listBoardTasks`
filtert fest auf `projectId: null`. Die Trennung steht in der Fachlogik, damit
keine Ansicht sie aufweichen kann. Dasselbe gilt fürs Dashboard.

**Gelöscht heißt nicht weg.** Task, Note und Attachment haben `deletedAt`
(Papierkorb, 30 Tage). **Jede neue Abfrage muss `deletedAt: null` filtern** –
auch Fortschritt, Zählungen und Suche.

**Volltextsuche läuft über generierte `tsvector`-Spalten**, die es nur in den
Migrationen gibt, nicht in `schema.prisma`. Abgefragt wird per `$queryRaw` über
fünf `UNION`-Zweige. Generierte Spalten lassen sich nicht ändern, nur ersetzen –
dafür braucht es eine neue Migration mit `DROP COLUMN` + `ADD COLUMN`.

Der Auszug aus `ts_headline` wird **selbst escaped**: Postgres setzt eigene
Marken, der Text wird escaped, erst danach werden die Marken zu `<b>`. Wer das
umgeht, holt sich HTML aus Notizen in die Seite.

**Wiederkehrende Aufgaben haben keinen Scheduler.** Der Nachfolger entsteht in
`changeTaskStatus`, wenn eine freie Aufgabe auf `ERLEDIGT` geht.

**Vorlagen werden kopiert, nicht referenziert** (`copyTemplateInto`). Änderungen
an einer Vorlage lassen laufende Projekte unberührt.

## Fallen, die schon Zeit gekostet haben

**Konstanten aus `"use client"`-Dateien.** Was ein Server-Modul von dort
importiert, ist nicht der Wert, sondern ein Platzhalter – die Seite quittiert mit
500. Gemeinsame Konstanten gehören in ein neutrales Modul, siehe
`src/lib/tabellen.ts`.

**`PM_DESKTOP`** unterscheidet die Fassungen zur Laufzeit; gesetzt wird es in
`desktop/main.mjs`. Die Einstellungsseite hängt daran.

**Node kennt den Windows-Zertifikatspeicher nicht.** Ein HTTPS-Aufruf auf das
eigene mkcert-Zertifikat scheitert in Node, obwohl Outlook und Browser es
akzeptieren. Wenn es nur um „läuft da wer?" geht: TCP-Verbindung prüfen.

**Migrationen sind handgeschriebenes SQL.** `prisma migrate dev` im Container
nicht aufrufen (Begründung in der README). Neue Migration = neuer Ordner unter
`prisma/migrations/` nach dem bestehenden Namensmuster.

## Git

Aus der WSL heraus gibt es **keine Anmeldedaten** für GitHub – `git push` hängt
dort. Commits entstehen in `~/projektmanager`, wandern per Bundle in diese
Arbeitskopie und werden von hier gepusht:

```bash
wsl -d Ubuntu -- bash -c "cd ~/projektmanager && git bundle create /mnt/c/temp/pm.bundle main"
```

Danach hier `git fetch <bundle> refs/heads/main:refs/remotes/wsl/main`, mit
`git diff wsl/main` prüfen, dass der Inhalt identisch ist, `git reset --hard
wsl/main`, dann `git push`.

`sicherungen/` enthält echte Kundendaten und steht in `.gitignore`. Das Repo ist
öffentlich – nichts committen, was dort nicht hingehört.

## Betrieb

`scripts/backup.sh` (Cron, zweimal täglich, spiegelt nach `BACKUP_MIRROR`),
`scripts/restore.sh` (sichert den Ist-Zustand vorher selbst), `scripts/watchdog.sh`
(startet ungesunde Container neu – Docker tut das von sich aus nicht).
Einzelheiten in `BETRIEB.md`.
