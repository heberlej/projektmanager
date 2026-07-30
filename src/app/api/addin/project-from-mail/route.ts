import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createProject, linkMail } from "@/lib/service";
import { projectFromMailSchema } from "@/lib/validation";

/**
 * Legt ein Projekt an (optional aus Vorlage) und heftet die ausloesende Mail
 * direkt an. Projekt und Mail-Verknuepfung entstehen zusammen.
 */
export async function POST(request: Request) {
  const parsed = projectFromMailSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ungueltige Anfrage" },
      { status: 400 },
    );
  }

  const project = await createProject(parsed.data.project);
  await linkMail(project.id, parsed.data.mail);

  revalidatePath("/projekte");
  revalidatePath("/");

  return NextResponse.json({ projectId: project.id, projectName: project.name });
}
