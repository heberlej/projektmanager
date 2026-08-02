import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

/**
 * Einrichtung des Outlook-Add-ins fuer die Windows-Fassung.
 *
 * Das Add-in braucht HTTPS mit einem Zertifikat, dem Windows vertraut - die
 * Anwendung selbst nicht. Bisher stand der Weg dorthin nur in einer
 * Markdown-Datei; wer den Installer bekommt, hat die nicht. Deshalb hier.
 *
 * Was diese Datei *nicht* tut: Zertifikate erzeugen oder in den
 * Vertrauensspeicher schreiben. Das bleibt ein bewusster Schritt mit
 * Administratorabfrage, den die Seite erklaert statt ihn zu verstecken.
 */

/** Nur in der Windows-Fassung gesetzt; im Docker-Betrieb ist die Seite sinnlos. */
export function istDesktop(): boolean {
  return process.env.PM_DESKTOP === "1";
}

export function datenVerzeichnis(): string {
  return (
    process.env.PM_DATEN_VERZEICHNIS ??
    path.join(process.env.APPDATA ?? "", "Projektmanager")
  );
}

export function addinPort(): number {
  return Number(process.env.PM_ADDIN_PORT ?? 44383);
}

async function existiert(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** Nimmt jemand auf 127.0.0.1:port Verbindungen an? */
async function portOffen(port: number): Promise<boolean> {
  const { connect } = await import("node:net");
  return new Promise((aufloesen) => {
    const dose = connect({ host: "127.0.0.1", port });
    const fertig = (ergebnis: boolean) => {
      dose.destroy();
      aufloesen(ergebnis);
    };
    dose.setTimeout(1500);
    dose.once("connect", () => fertig(true));
    dose.once("timeout", () => fertig(false));
    dose.once("error", () => fertig(false));
  });
}

export type Einrichtungsstand = {
  zertifikat: boolean;
  zuhoerer: boolean;
  hostsEintrag: boolean;
  manifest: string | null;
  zertifikatsOrdner: string;
  port: number;
};

export async function einrichtungsstand(): Promise<Einrichtungsstand> {
  const daten = datenVerzeichnis();
  const zertOrdner = path.join(daten, "zertifikate");
  const port = addinPort();

  const zertifikat =
    (await existiert(path.join(zertOrdner, "pm.localhost.pem"))) &&
    (await existiert(path.join(zertOrdner, "pm.localhost-key.pem")));

  // Der Zuhoerer wird nur mit Zertifikat gestartet - trotzdem nachsehen statt
  // schliessen: der Port koennte belegt gewesen sein.
  //
  // Geprueft wird die Verbindung, nicht die Antwort. Ein HTTPS-Aufruf wuerde
  // hier scheitern, obwohl alles stimmt: Node prueft Zertifikate gegen seinen
  // eigenen Speicher, und die mkcert-Wurzel liegt im Windows-Speicher. Fuer
  // Outlook zaehlt der - fuer Node nicht.
  const zuhoerer = zertifikat ? await portOffen(port) : false;

  let hostsEintrag = false;
  try {
    const hosts = await readFile(
      path.join(process.env.SystemRoot ?? "C:\\Windows", "System32/drivers/etc/hosts"),
      "utf8",
    );
    hostsEintrag = /^\s*127\.0\.0\.1\s+pm\.localhost\s*$/m.test(hosts);
  } catch {
    hostsEintrag = false;
  }

  const manifestPfad = path.join(daten, "manifest-windows.xml");
  const manifest = (await existiert(manifestPfad)) ? manifestPfad : null;

  return { zertifikat, zuhoerer, hostsEintrag, manifest, zertifikatsOrdner: zertOrdner, port };
}

/**
 * Erzeugt das Manifest aus dem mitgelieferten und traegt Port und Kennung ein.
 *
 * Die Kennung wird beim erneuten Erzeugen **beibehalten**. Eine neue wuerde
 * Outlook als zweites Add-in fuehren, und man haette beide nebeneinander
 * stehen, ohne zu wissen welches gilt.
 */
export async function manifestErzeugen(): Promise<string> {
  const daten = datenVerzeichnis();
  const port = addinPort();
  const ziel = path.join(daten, "manifest-windows.xml");

  const vorlage = await readFile(path.join(process.cwd(), "public", "manifest.xml"), "utf8");

  // Ausdruecklich string: randomUUID() liefert einen engeren Vorlagentyp, in
  // den die aus der Datei gelesene Kennung nicht passt.
  let kennung: string = randomUUID();
  if (await existiert(ziel)) {
    const alt = await readFile(ziel, "utf8");
    const treffer = alt.match(/<Id>([0-9a-fA-F-]{36})<\/Id>/);
    if (treffer) kennung = treffer[1];
  }

  const neu = vorlage
    .replaceAll("https://pm.localhost", `https://pm.localhost:${port}`)
    .replace(/<Id>[0-9a-fA-F-]{36}<\/Id>/, `<Id>${kennung}</Id>`)
    .replace(
      /<DisplayName DefaultValue="([^"]*)"/,
      (_treffer, name: string) => `<DisplayName DefaultValue="${name} (Windows)"`,
    );

  await mkdir(daten, { recursive: true });
  await writeFile(ziel, neu, "utf8");
  return ziel;
}
