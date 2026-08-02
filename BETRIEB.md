# WSL-Fassung – der laufende Betrieb

Dieser Ordner enthält die **Docker-Fassung**: den vollständigen Quelltext und
alles, was sie braucht. Sie läuft in der WSL unter Ubuntu und ist über
<https://pm.localhost> erreichbar.

Die installierte Fassung liegt **nicht hier**, sondern in der WSL unter
`~/projektmanager`. Dieser Ordner ist eine zweite Arbeitskopie desselben
Git-Repositorys – zum Bearbeiten unter Windows und zum Pushen nach GitHub, weil
aus der WSL heraus keine Anmeldedaten hinterlegt sind.

Die Windows-Fassung liegt im Nachbarordner `..\Desktop`.

---

## Erstinstallation

Steht vollständig in [INSTALL.md](INSTALL.md) – WSL 2, Docker, mkcert,
Zertifikat, `.env`, `docker compose up -d --build`.

## Täglicher Betrieb

```bash
wsl -d Ubuntu -- bash -c "cd ~/projektmanager && docker compose ps"
```

| | |
| --- | --- |
| Sicherung | zweimal täglich per Cron (12:00, 20:00) |
| Spiegel | `sicherungen\` in diesem Ordner |
| Wachhund | alle 5 Minuten, startet ungesunde Container neu |
| Autostart | Aufgabenplanung startet WSL bei der Anmeldung |

## `sicherungen\`

Der zweite Ablageort der Sicherungen, außerhalb der WSL. Er enthält **echte
Projektdaten** – Kundennamen, Mailbetreffe, Anhänge. Beim Weitergeben dieses
Ordners daran denken.

Zurückspielen:

```bash
wsl -d Ubuntu -- bash -c "cd ~/projektmanager && ./scripts/restore.sh backups/db-….sql.gz backups/uploads-….tar.gz"
```

`restore.sh` sichert den Ist-Zustand vorher selbst weg – der Dump enthält
`--clean` und wirft alles weg, was seit der Sicherung entstanden ist.

## Entwickeln

`node_modules` und `.next` sind bewusst nicht in diesem Ordner: Zehntausende
Dateien in einem synchronisierten Verzeichnis sind für OneDrive eine Zumutung.
Vor dem Arbeiten einmal:

```bash
npm ci
```

Tests und Typprüfung laufen ohne Node auf dem Host:

```bash
wsl -d Ubuntu -- bash -c "cd ~/projektmanager && ./scripts/test.sh"
```

## Verhältnis zur Windows-Fassung

Beide Fassungen benutzen denselben Quelltext, aber **getrennte Datenbestände**.
Wer beide parallel betreibt, hat nach kurzer Zeit zwei auseinanderlaufende
Stände. Der Umzug von hier nach dort geht mit
`..\Desktop\quellen\scripts\daten-uebernehmen.ps1` – er liest nur und lässt
diese Installation unangetastet.
