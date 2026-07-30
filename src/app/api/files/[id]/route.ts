import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveStoragePath } from "@/lib/storage";

/**
 * Dateien werden bewusst nicht statisch ausgeliefert, sondern ueber diesen
 * Handler - so bleibt der Ablagepfad ein Implementierungsdetail.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  const attachment = await prisma.attachment.findUnique({ where: { id } });
  if (!attachment) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }

  let data: Buffer;
  try {
    data = await readFile(resolveStoragePath(attachment.storagePath));
  } catch {
    return NextResponse.json({ error: "Datei fehlt in der Ablage" }, { status: 410 });
  }

  const asciiName = attachment.filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");

  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": attachment.mime || "application/octet-stream",
      "Content-Length": String(data.byteLength),
      "Content-Disposition": `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
