/**
 * Holt die Beigaben, die nicht ins Repo gehoeren.
 *
 *   node scripts/beigaben-holen.mjs
 *
 * Das sind zwei Dinge:
 *   1. Die PostgreSQL-Binaerdateien fuer Windows (rund 250 MB entpackt)
 *   2. Der gebaute Next.js-Server aus dem Hauptprojekt
 *
 * Beides landet unter beigaben/ und wird von electron-builder eingepackt.
 * 250 MB Fremdbinaerdateien in Git waeren an dieser Stelle die falsche
 * Entscheidung - sie aendern sich nie und lassen sich jederzeit neu holen.
 */

import { mkdir, rm, cp, access } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ausfuehren = promisify(execFile);
const hier = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const beigaben = path.join(hier, "beigaben");
const hauptprojekt = path.dirname(hier);

// EnterpriseDB liefert PostgreSQL auch als reines Zip ohne Installer.
const PG_VERSION = "16.4-1";
const PG_URL = `https://get.enterprisedb.com/postgresql/postgresql-${PG_VERSION}-windows-x64-binaries.zip`;

async function existiert(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function postgresHolen() {
  const ziel = path.join(beigaben, "pgsql");
  if (await existiert(path.join(ziel, "bin", "postgres.exe"))) {
    console.log("[pg]   schon da");
    return;
  }

  console.log(`[pg]   lade ${PG_URL}`);
  const zip = path.join(beigaben, "pgsql.zip");
  await mkdir(beigaben, { recursive: true });

  const antwort = await fetch(PG_URL);
  if (!antwort.ok) throw new Error(`Download fehlgeschlagen: ${antwort.status}`);
  await pipeline(antwort.body, createWriteStream(zip));

  console.log("[pg]   entpacke");
  await ausfuehren("powershell", [
    "-NoProfile",
    "-Command",
    `Expand-Archive -Path '${zip}' -DestinationPath '${beigaben}' -Force`,
  ]);
  await rm(zip);

  // Das Zip bringt Beispieldaten und Dokumentation mit - die braucht hier
  // niemand und sie kosten 100 MB.
  for (const weg of ["doc", "include", "pgAdmin 4", "StackBuilder", "symbols"]) {
    await rm(path.join(ziel, weg), { recursive: true, force: true });
  }
  console.log("[pg]   fertig");
}

async function anwendungBauen() {
  const ziel = path.join(beigaben, "app");
  console.log("[app]  baue das Hauptprojekt (standalone)");

  // next.config.ts muss dafuer output: "standalone" setzen - siehe ARCHITEKTUR.md
  await ausfuehren("npm", ["run", "build"], { cwd: hauptprojekt, shell: true });

  await rm(ziel, { recursive: true, force: true });
  await mkdir(ziel, { recursive: true });

  const standalone = path.join(hauptprojekt, ".next", "standalone");
  await cp(standalone, ziel, { recursive: true });
  await cp(path.join(hauptprojekt, ".next", "static"), path.join(ziel, ".next", "static"), {
    recursive: true,
  });
  await cp(path.join(hauptprojekt, "public"), path.join(ziel, "public"), { recursive: true });
  await cp(path.join(hauptprojekt, "prisma"), path.join(ziel, "prisma"), { recursive: true });

  console.log("[app]  fertig");
}

await mkdir(beigaben, { recursive: true });
await postgresHolen();
await anwendungBauen();
console.log("\nBeigaben liegen unter beigaben/. Weiter mit: npm run bauen");
