import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { addAttachment } from "@/lib/service";
import { addinAttachmentSchema, MAX_UPLOAD_BYTES } from "@/lib/validation";
import { prisma } from "@/lib/db";

/** Nimmt einen Mail-Anhang als Base64 entgegen (Office.js liefert genau das). */
export async function POST(request: Request) {
  const parsed = addinAttachmentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ungueltige Anfrage" },
      { status: 400 },
    );
  }

  const project = await prisma.project.findUnique({
    where: { id: parsed.data.projectId },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Projekt nicht gefunden" }, { status: 404 });
  }

  const data = Buffer.from(parsed.data.contentBase64, "base64");
  if (data.byteLength === 0) {
    return NextResponse.json({ error: "Anhang ist leer" }, { status: 400 });
  }
  if (data.byteLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Anhang ist zu gross" }, { status: 413 });
  }

  const attachment = await addAttachment(
    project.id,
    parsed.data.filename,
    parsed.data.mime,
    data,
    "OUTLOOK",
  );

  revalidatePath(`/projekte/${project.id}`);

  return NextResponse.json({
    attachmentId: attachment.id,
    filename: attachment.filename,
    sizeBytes: attachment.sizeBytes,
  });
}
