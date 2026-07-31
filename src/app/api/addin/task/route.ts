import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createTask, linkMail } from "@/lib/service";
import { addinTaskSchema } from "@/lib/validation";
import { prisma } from "@/lib/db";

/**
 * Legt eine Aufgabe aus dem Taskpane an. Projekt und Mail sind beide optional:
 * eine Aufgabe darf fuer sich stehen, und ob die Mail mitkommt, entscheidet der
 * Haken im Add-in.
 */
export async function POST(request: Request) {
  const parsed = addinTaskSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ungueltige Anfrage" },
      { status: 400 },
    );
  }

  const projectId = parsed.data.projectId || null;
  if (projectId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Projekt nicht gefunden" }, { status: 404 });
    }
  }

  const task = await createTask({
    title: parsed.data.title,
    projectId,
    notes: parsed.data.notes || null,
    status: parsed.data.status,
  });

  // Eine Mail haengt immer an einem Projekt - ohne Projekt gibt es nichts zu verknuepfen.
  let mailLinked = false;
  if (parsed.data.mail && projectId) {
    await linkMail(projectId, parsed.data.mail);
    await prisma.project.update({ where: { id: projectId }, data: { updatedAt: new Date() } });
    mailLinked = true;
  }

  if (projectId) revalidatePath(`/projekte/${projectId}`);
  revalidatePath("/aufgaben");
  revalidatePath("/projekte");
  revalidatePath("/");

  return NextResponse.json({
    taskId: task.id,
    title: task.title,
    projectId,
    mailLinked,
    mailSkipped: Boolean(parsed.data.mail) && !projectId,
  });
}
