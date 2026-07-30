import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { linkMail } from "@/lib/service";
import { linkMailSchema } from "@/lib/validation";
import { prisma } from "@/lib/db";

/** Heftet eine Mail an ein bestehendes Projekt. Idempotent. */
export async function POST(request: Request) {
  const parsed = linkMailSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ungueltige Anfrage" },
      { status: 400 },
    );
  }

  const project = await prisma.project.findUnique({
    where: { id: parsed.data.projectId },
    select: { id: true, name: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Projekt nicht gefunden" }, { status: 404 });
  }

  const existing = await prisma.mailLink.findUnique({
    where: { internetMessageId: parsed.data.mail.internetMessageId },
    select: { projectId: true },
  });

  const link = await linkMail(project.id, parsed.data.mail);
  await prisma.project.update({ where: { id: project.id }, data: { updatedAt: new Date() } });

  revalidatePath(`/projekte/${project.id}`);
  revalidatePath("/projekte");
  revalidatePath("/");

  return NextResponse.json({
    mailLinkId: link.id,
    projectId: project.id,
    projectName: project.name,
    alreadyLinked: existing?.projectId === project.id,
    movedFromProjectId: existing && existing.projectId !== project.id ? existing.projectId : null,
  });
}
