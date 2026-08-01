/**
 * Mitgelieferte PostgreSQL-Instanz.
 *
 * Beim ersten Start wird ein Datenverzeichnis unter %APPDATA% angelegt, danach
 * laeuft postgres.exe als Kindprozess auf einem freien Port. Die Anwendung
 * selbst merkt davon nichts - sie bekommt eine DATABASE_URL wie immer.
 */

import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { randomBytes } from "node:crypto";

const ausfuehren = promisify(execFile);

/** Sucht einen freien Port, statt 5432 zu belegen - dort koennte schon etwas laufen. */
export async function freierPort() {
  return new Promise((aufloesen, ablehnen) => {
    const server = createServer();
    server.unref();
    server.on("error", ablehnen);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => aufloesen(port));
    });
  });
}

async function existiert(pfad) {
  try {
    await access(pfad);
    return true;
  } catch {
    return false;
  }
}

export class Datenbank {
  /**
   * @param {object} opt
   * @param {string} opt.binVerzeichnis  Ordner mit initdb.exe, postgres.exe, pg_ctl.exe
   * @param {string} opt.datenVerzeichnis  %APPDATA%\Projektmanager
   */
  constructor({ binVerzeichnis, datenVerzeichnis }) {
    this.bin = binVerzeichnis;
    this.pgdata = path.join(datenVerzeichnis, "pgdata");
    this.passwortDatei = path.join(datenVerzeichnis, "db-passwort");
    this.prozess = null;
    this.port = null;
  }

  exe(name) {
    return path.join(this.bin, `${name}.exe`);
  }

  /**
   * Passwort einmal erzeugen und liegen lassen. Die Datenbank hoert nur auf
   * 127.0.0.1, das Passwort schuetzt also gegen andere Benutzerkonten auf
   * demselben Rechner, nicht gegen das Netz.
   */
  async passwort() {
    if (await existiert(this.passwortDatei)) {
      return (await readFile(this.passwortDatei, "utf8")).trim();
    }
    const neu = randomBytes(24).toString("base64url");
    await writeFile(this.passwortDatei, neu, { mode: 0o600 });
    return neu;
  }

  /** Legt das Datenverzeichnis an, falls es noch keins gibt. */
  async einrichtenFallsNoetig() {
    if (await existiert(path.join(this.pgdata, "PG_VERSION"))) return false;

    await mkdir(path.dirname(this.pgdata), { recursive: true });
    const pw = await this.passwort();
    const pwDatei = path.join(path.dirname(this.pgdata), "initdb-passwort.tmp");
    await writeFile(pwDatei, pw, { mode: 0o600 });

    // -E UTF8 und die deutsche Sortierung: die Volltextsuche arbeitet mit dem
    // Woerterbuch 'german', da soll auch die Kollation dazu passen.
    await ausfuehren(this.exe("initdb"), [
      "-D", this.pgdata,
      "-U", "pm",
      "--pwfile", pwDatei,
      "-E", "UTF8",
      "--locale", "German_Germany.1252",
    ]);

    await writeFile(pwDatei, "", { mode: 0o600 });
    return true;
  }

  async starten() {
    this.port = await freierPort();
    this.prozess = spawn(
      this.exe("postgres"),
      ["-D", this.pgdata, "-p", String(this.port), "-h", "127.0.0.1", "-c", "logging_collector=off"],
      { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
    );

    await this.wartenBisBereit();
    return this.port;
  }

  /** Wartet, bis pg_isready durchgeht - sonst laeuft die Migration ins Leere. */
  async wartenBisBereit(versuche = 40) {
    for (let i = 0; i < versuche; i++) {
      try {
        await ausfuehren(this.exe("pg_isready"), ["-h", "127.0.0.1", "-p", String(this.port), "-U", "pm"]);
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    throw new Error("Datenbank ist nicht bereit geworden");
  }

  async datenbankAnlegenFallsNoetig() {
    const pw = await this.passwort();
    const umgebung = { ...process.env, PGPASSWORD: pw };
    const { stdout } = await ausfuehren(
      this.exe("psql"),
      ["-h", "127.0.0.1", "-p", String(this.port), "-U", "pm", "-d", "postgres", "-tAc",
       "SELECT 1 FROM pg_database WHERE datname='pm'"],
      { env: umgebung },
    );
    if (stdout.trim() === "1") return false;

    await ausfuehren(
      this.exe("createdb"),
      ["-h", "127.0.0.1", "-p", String(this.port), "-U", "pm", "pm"],
      { env: umgebung },
    );
    return true;
  }

  async verbindungsZeichenfolge() {
    const pw = encodeURIComponent(await this.passwort());
    return `postgresql://pm:${pw}@127.0.0.1:${this.port}/pm?schema=public`;
  }

  /**
   * Sauber herunterfahren. Ein hartes Beenden hinterlaesst ein
   * wiederherzustellendes Datenverzeichnis - beim naechsten Start dauert es
   * dann laenger, im schlechten Fall geht die letzte Transaktion verloren.
   */
  async beenden() {
    if (!this.prozess) return;
    try {
      await ausfuehren(this.exe("pg_ctl"), ["-D", this.pgdata, "-m", "fast", "stop"]);
    } catch {
      this.prozess.kill();
    }
    this.prozess = null;
  }
}
