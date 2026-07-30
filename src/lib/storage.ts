import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

export const UPLOAD_DIR = path.resolve(
  process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads"),
);

/** Entfernt Pfadanteile und alles, was im Dateisystem Aerger macht. */
export function sanitizeFilename(name: string): string {
  const base = path.basename(name).replace(/[\\/]/g, "");
  const cleaned = base.replace(/[^\w.\- ()äöüÄÖÜß]/g, "_").trim();
  return (cleaned || "datei").slice(0, 180);
}

export type StoredFile = {
  storagePath: string;
  filename: string;
  sizeBytes: number;
};

/**
 * Legt eine Datei unter <UPLOAD_DIR>/<projectId>/<uuid>-<name> ab und gibt den
 * relativen Pfad zurueck, der in Attachment.storagePath landet.
 */
export async function storeFile(
  projectId: string,
  filename: string,
  data: Buffer,
): Promise<StoredFile> {
  const safeName = sanitizeFilename(filename);
  const dir = path.join(UPLOAD_DIR, projectId);
  await mkdir(dir, { recursive: true });

  const relative = path.posix.join(projectId, `${randomUUID()}-${safeName}`);
  await writeFile(path.join(UPLOAD_DIR, relative), data);

  return { storagePath: relative, filename: safeName, sizeBytes: data.byteLength };
}

/**
 * Loest storagePath zu einem absoluten Pfad auf und stellt sicher, dass er
 * innerhalb von UPLOAD_DIR liegt (Schutz gegen ../-Pfade aus der Datenbank).
 */
export function resolveStoragePath(storagePath: string): string {
  const abs = path.resolve(UPLOAD_DIR, storagePath);
  const root = UPLOAD_DIR.endsWith(path.sep) ? UPLOAD_DIR : UPLOAD_DIR + path.sep;
  if (!abs.startsWith(root)) {
    throw new Error("Ungueltiger Ablagepfad");
  }
  return abs;
}
