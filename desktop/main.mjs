/**
 * Hauptprozess der Windows-Fassung.
 *
 * Reihenfolge beim Start: Datenbank hoch, Migrationen fahren, Next-Server
 * starten, Fenster oeffnen. Jeder Schritt kann dauern, deshalb sieht der
 * Benutzer waehrenddessen einen Startbildschirm und keinen weissen Kasten.
 */

import { app, BrowserWindow, shell, dialog } from "electron";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mkdir, readFile } from "node:fs/promises";
import https from "node:https";
import http from "node:http";
import { Datenbank, freierPort } from "./postgres.mjs";

/**
 * Fester Port fuer das Outlook-Add-in.
 *
 * Fest, weil er im Manifest steht - ein wechselnder Port waere dort nicht
 * abbildbar. Nicht 443, weil das Administratorrechte verlangt.
 */
const ADDIN_PORT = 44383;

const hier = path.dirname(fileURLToPath(import.meta.url));

// Im gepackten Zustand liegen die Beigaben in resources/, in der Entwicklung
// daneben im Ordner.
const ressourcen = app.isPackaged ? process.resourcesPath : hier;
const datenVerzeichnis = path.join(app.getPath("appData"), "Projektmanager");

let fenster = null;
let datenbank = null;
let server = null;

async function schrittMelden(text) {
  if (fenster && !fenster.isDestroyed()) {
    await fenster.webContents.executeJavaScript(
      `document.getElementById("schritt") && (document.getElementById("schritt").textContent = ${JSON.stringify(text)})`,
    ).catch(() => undefined);
  }
}

function startbildschirm() {
  // Absichtlich als data-URL: der Startbildschirm darf nicht davon abhaengen,
  // dass schon irgendetwas laeuft.
  const html = `<!doctype html><meta charset="utf-8"><title>Projektmanager</title>
  <style>
    :root { color-scheme: light dark; }
    body { margin:0; height:100vh; display:grid; place-items:center;
      font: 15px -apple-system, "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif;
      background:#f2f2f7; color:#1c1c1e; }
    @media (prefers-color-scheme: dark) { body { background:#0f0f11; color:#f2f2f7; } }
    .k { text-align:center; }
    .p { width:180px; height:3px; margin:16px auto 0; border-radius:999px;
      background:currentColor; opacity:.15; overflow:hidden; }
    .p::after { content:""; display:block; height:100%; width:40%; border-radius:999px;
      background:#0071e3; animation: lauf 1.1s ease-in-out infinite; }
    @keyframes lauf { 0%{transform:translateX(-100%)} 100%{transform:translateX(350%)} }
    #schritt { opacity:.6; font-size:13px; margin-top:10px; }
  </style>
  <div class="k">
    <div style="font-size:17px;font-weight:600">Projektmanager</div>
    <div class="p"></div>
    <div id="schritt">wird gestartet …</div>
  </div>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

async function nextStarten(datenbankUrl) {
  const port = await freierPort();
  const serverJs = path.join(ressourcen, "app", "server.js");

  server = spawn(process.execPath, [serverJs], {
    env: {
      ...process.env,
      // ELECTRON_RUN_AS_NODE: der Next-Server soll ein Node-Prozess sein,
      // kein zweites Electron mit Fenster.
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      DATABASE_URL: datenbankUrl,
      UPLOAD_DIR: path.join(datenVerzeichnis, "uploads"),
      APP_ORIGIN: `http://127.0.0.1:${port}`,
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      TZ: "Europe/Berlin",
      // Woran die Anwendung erkennt, dass sie im Fenster laeuft. Davon haengt
      // die Einstellungsseite fuer das Add-in ab, die im Docker-Betrieb
      // sinnlos waere.
      PM_DESKTOP: "1",
      PM_DATEN_VERZEICHNIS: datenVerzeichnis,
      PM_ADDIN_PORT: String(ADDIN_PORT),
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  server.stdout.on("data", (d) => process.stdout.write(`[next] ${d}`));
  server.stderr.on("data", (d) => process.stderr.write(`[next] ${d}`));

  // Warten, bis der Server antwortet - "Ready" im Log ist unzuverlaessig.
  for (let i = 0; i < 60; i++) {
    try {
      const antwort = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (antwort.ok) return port;
    } catch {
      /* noch nicht da */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Der Anwendungsserver ist nicht hochgekommen");
}

async function migrationenFahren(datenbankUrl) {
  return new Promise((aufloesen, ablehnen) => {
    const prisma = spawn(
      process.execPath,
      [path.join(ressourcen, "app", "node_modules", "prisma", "build", "index.js"), "migrate", "deploy"],
      {
        cwd: path.join(ressourcen, "app"),
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", DATABASE_URL: datenbankUrl },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    prisma.stdout.on("data", (d) => process.stdout.write(`[prisma] ${d}`));
    prisma.stderr.on("data", (d) => process.stderr.write(`[prisma] ${d}`));
    prisma.on("exit", (code) =>
      code === 0 ? aufloesen() : ablehnen(new Error(`Migration fehlgeschlagen (${code})`)),
    );
  });
}

/**
 * Standard-Tags und die beiden Vorlagen anlegen. Im Docker-Betrieb macht das
 * der Entrypoint; hier muss es jemand tun, sonst startet die Anwendung mit
 * leerer Vorlagenliste. Der Seed ist idempotent und darf bei jedem Start
 * mitlaufen.
 */
async function seedFahren(datenbankUrl) {
  return new Promise((aufloesen) => {
    const seed = spawn(process.execPath, [path.join(ressourcen, "app", "prisma", "seed.mjs")], {
      cwd: path.join(ressourcen, "app"),
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", DATABASE_URL: datenbankUrl },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    seed.stdout.on("data", (d) => process.stdout.write(`[seed] ${d}`));
    seed.stderr.on("data", (d) => process.stderr.write(`[seed] ${d}`));
    // Ein fehlgeschlagener Seed ist aergerlich, aber kein Grund, den Start
    // abzubrechen - die Anwendung ist auch ohne Vorlagen benutzbar.
    seed.on("exit", () => aufloesen());
  });
}

/**
 * HTTPS-Zuhoerer fuer das Add-in.
 *
 * Outlook laedt Add-in-Seiten nur ueber HTTPS mit einem Zertifikat, dem Windows
 * vertraut. Das Fenster selbst braucht das nicht - deshalb laeuft hier nur ein
 * schlanker Vorschalt-Server, der an den internen Port weiterreicht.
 *
 * Ohne hinterlegtes Zertifikat passiert schlicht nichts: wer das Add-in nicht
 * benutzt, bekommt weder einen Zuhoerer noch eine Nachfrage. Eingerichtet wird
 * es mit scripts\addin-einrichten.ps1 - ein bewusster, eigener Schritt.
 */
async function addinZuhoererStarten(zielPort) {
  const ordner = path.join(datenVerzeichnis, "zertifikate");
  let cert;
  let key;
  try {
    cert = await readFile(path.join(ordner, "pm.localhost.pem"));
    key = await readFile(path.join(ordner, "pm.localhost-key.pem"));
  } catch {
    return null;
  }

  const server = https.createServer({ cert, key }, (anfrage, antwort) => {
    const weiter = http.request(
      {
        host: "127.0.0.1",
        port: zielPort,
        path: anfrage.url,
        method: anfrage.method,
        headers: anfrage.headers,
      },
      (innen) => {
        antwort.writeHead(innen.statusCode ?? 502, innen.headers);
        innen.pipe(antwort);
      },
    );
    weiter.on("error", () => {
      antwort.writeHead(502);
      antwort.end("Anwendung nicht erreichbar");
    });
    anfrage.pipe(weiter);
  });

  return new Promise((aufloesen) => {
    server.on("error", () => aufloesen(null)); // Port belegt - dann eben ohne
    server.listen(ADDIN_PORT, "127.0.0.1", () => aufloesen(ADDIN_PORT));
  });
}

async function hochfahren() {
  await mkdir(path.join(datenVerzeichnis, "uploads"), { recursive: true });

  datenbank = new Datenbank({
    binVerzeichnis: path.join(ressourcen, "pgsql", "bin"),
    datenVerzeichnis,
  });

  await schrittMelden("Datenbank wird vorbereitet …");
  const ersterStart = await datenbank.einrichtenFallsNoetig();
  await datenbank.starten();
  await datenbank.datenbankAnlegenFallsNoetig();

  const url = await datenbank.verbindungsZeichenfolge();

  await schrittMelden(ersterStart ? "Datenbank wird angelegt …" : "Datenbank wird aktualisiert …");
  await migrationenFahren(url);
  await seedFahren(url);

  await schrittMelden("Anwendung wird gestartet …");
  const port = await nextStarten(url);

  const addin = await addinZuhoererStarten(port);
  if (addin) console.log(`[addin] erreichbar unter https://pm.localhost:${addin}`);

  await fenster.loadURL(`http://127.0.0.1:${port}`);
}

function fensterOeffnen() {
  fenster = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: "#f2f2f7",
    autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  fenster.once("ready-to-show", () => fenster.show());
  fenster.loadURL(startbildschirm());

  // Verweise nach draussen gehoeren in den Browser, nicht in dieses Fenster -
  // sonst landet ein Outlook-Deeplink im Anwendungsfenster.
  fenster.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  fenster.webContents.on("will-navigate", (ereignis, url) => {
    if (!url.startsWith("http://127.0.0.1:")) {
      ereignis.preventDefault();
      shell.openExternal(url);
    }
  });
}

app.whenReady().then(async () => {
  fensterOeffnen();
  try {
    await hochfahren();
  } catch (fehler) {
    dialog.showErrorBox(
      "Start fehlgeschlagen",
      `${fehler.message}\n\nDie Daten liegen unter:\n${datenVerzeichnis}`,
    );
    app.quit();
  }
});

// Sauber abraeumen: erst der Server, dann die Datenbank.
app.on("before-quit", async (ereignis) => {
  if (!datenbank && !server) return;
  ereignis.preventDefault();
  server?.kill();
  server = null;
  await datenbank?.beenden();
  datenbank = null;
  app.quit();
});

app.on("window-all-closed", () => app.quit());
