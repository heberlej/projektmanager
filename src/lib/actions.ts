"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import {
  addAttachment,
  applyTemplateToProject,
  changeProjectStatus,
  changeTaskStatus,
  createProject,
  createTask,
  setSchedule,
  templateFromProject,
} from "./service";
import { resolveStoragePath } from "./storage";
import { unlink } from "node:fs/promises";
import { isStatus, isTaskStatus, toggledTaskStatus, type TaskStatus } from "./status";
import {
  firstIssue,
  MAX_UPLOAD_BYTES,
  noteSchema,
  phaseSchema,
  projectCreateSchema,
  scheduleSchema,
  tagSchema,
  taskSchema,
  templateSchema,
} from "./validation";

/**
 * Server Actions der Oberflaeche. Fehler werden als String zurueckgegeben und
 * im Formular angezeigt; Ausnahme sind Aktionen mit redirect().
 */

export type ActionState = { error?: string; ok?: boolean };

function refreshProject(projectId: string | null) {
  if (projectId) revalidatePath(`/projekte/${projectId}`);
  revalidatePath("/projekte");
  revalidatePath("/aufgaben");
  revalidatePath("/kalender");
  revalidatePath("/");
}

// --- Projekt ----------------------------------------------------------------

export async function createProjectAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = projectCreateSchema.safeParse({
    name: formData.get("name"),
    customer: formData.get("customer"),
    status: formData.get("status") || undefined,
    priority: formData.get("priority") || undefined,
    description: formData.get("description") ?? "",
    templateId: formData.get("templateId") ?? "",
    tagIds: formData.getAll("tagIds").map(String).filter(Boolean),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Ungueltige Eingabe" };

  const project = await createProject(parsed.data);
  revalidatePath("/projekte");
  revalidatePath("/");
  redirect(`/projekte/${project.id}`);
}

export async function updateProjectAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const name = String(formData.get("name") ?? "").trim();
  const customer = String(formData.get("customer") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const priority = String(formData.get("priority") ?? "NORMAL");
  const tagIds = formData.getAll("tagIds").map(String).filter(Boolean);

  if (!name || !customer) return;

  await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id },
      data: {
        name,
        customer,
        description: description || null,
        priority: priority as "NIEDRIG" | "NORMAL" | "HOCH",
      },
    });
    await tx.projectTag.deleteMany({ where: { projectId: id } });
    if (tagIds.length > 0) {
      await tx.projectTag.createMany({
        data: tagIds.map((tagId) => ({ projectId: id, tagId })),
        skipDuplicates: true,
      });
    }
  });

  refreshProject(id);
}

export async function setStatusAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !isStatus(status)) return;
  await changeProjectStatus(id, status);
  refreshProject(id);
}

/** Aufruf aus dem Board per fetch - nur der Statuswechsel, ohne Formular. */
export async function moveProjectAction(projectId: string, status: string): Promise<void> {
  if (!isStatus(status)) return;
  await changeProjectStatus(projectId, status);
  refreshProject(projectId);
}

export async function setArchivedAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const archived = formData.get("archived") === "true";
  if (!id) return;
  await prisma.project.update({ where: { id }, data: { archived } });
  refreshProject(id);
}

export async function deleteProjectAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const attachments = await prisma.attachment.findMany({
    where: { projectId: id },
    select: { storagePath: true },
  });
  await prisma.project.delete({ where: { id } });
  for (const a of attachments) {
    await unlink(resolveStoragePath(a.storagePath)).catch(() => undefined);
  }

  revalidatePath("/projekte");
  revalidatePath("/");
  redirect("/projekte");
}

// --- Geplante Termine -------------------------------------------------------

/**
 * Setzt den Termin eines Projekts, einer Phase oder einer Aufgabe. Beide Felder
 * leer bedeutet: Termin entfernen.
 */
export async function setScheduleAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = scheduleSchema.safeParse({
    kind: formData.get("kind"),
    id: formData.get("id"),
    projectId: formData.get("projectId"),
    start: formData.get("start") ?? "",
    end: formData.get("end") ?? "",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  await setSchedule(parsed.data);
  refreshProject(parsed.data.projectId);
  return { ok: true };
}

// --- Phasen und Aufgaben ----------------------------------------------------

export async function addPhaseAction(formData: FormData): Promise<void> {
  const parsed = phaseSchema.safeParse({
    projectId: formData.get("projectId"),
    title: formData.get("title"),
  });
  if (!parsed.success) return;

  const last = await prisma.phase.aggregate({
    where: { projectId: parsed.data.projectId },
    _max: { position: true },
  });
  await prisma.phase.create({
    data: {
      projectId: parsed.data.projectId,
      title: parsed.data.title,
      position: (last._max.position ?? 0) + 1,
    },
  });
  refreshProject(parsed.data.projectId);
}

export async function deletePhaseAction(formData: FormData): Promise<void> {
  const id = String(formData.get("phaseId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  if (!id) return;
  await prisma.phase.delete({ where: { id } });
  refreshProject(projectId);
}

export async function addTaskAction(formData: FormData): Promise<void> {
  const parsed = taskSchema.safeParse({
    projectId: formData.get("projectId") ?? "",
    phaseId: formData.get("phaseId") ?? "",
    title: formData.get("title"),
    notes: formData.get("notes") ?? "",
    status: formData.get("status") || undefined,
  });
  if (!parsed.success) return;

  await createTask({
    title: parsed.data.title,
    projectId: parsed.data.projectId || null,
    phaseId: parsed.data.phaseId || null,
    notes: parsed.data.notes || null,
    status: parsed.data.status,
  });
  refreshProject(parsed.data.projectId || null);
}

/** Aus dem Aufgabenboard: freie Aufgabe ohne Projekt. */
export async function addLooseTaskAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // Kein projectId: die Aufgabenliste ist von den Projekten getrennt, was hier
  // entsteht, steht fuer sich. Projektaufgaben legt man im Projekt an.
  const parsed = taskSchema.safeParse({
    projectId: "",
    phaseId: "",
    title: formData.get("title"),
    notes: formData.get("notes") ?? "",
    status: formData.get("status") || undefined,
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  await createTask({
    title: parsed.data.title,
    projectId: null,
    notes: parsed.data.notes || null,
    status: parsed.data.status,
  });
  refreshProject(null);
  return { ok: true };
}

/** Kaestchen in der Aufgabenliste: schaltet zwischen offen und erledigt. */
export async function toggleTaskAction(formData: FormData): Promise<void> {
  const id = String(formData.get("taskId") ?? "");
  if (!id) return;

  const task = await prisma.task.findUnique({ where: { id }, select: { status: true } });
  if (!task) return;
  const projectId = await changeTaskStatus(id, toggledTaskStatus(task.status as TaskStatus));
  refreshProject(projectId);
}

/** Aufruf aus dem Aufgabenboard per fetch - nur der Statuswechsel. */
export async function moveTaskAction(taskId: string, status: string): Promise<void> {
  if (!isTaskStatus(status)) return;
  const projectId = await changeTaskStatus(taskId, status);
  refreshProject(projectId);
}

/** Statuswechsel aus einem Auswahlfeld. */
export async function setTaskStatusAction(formData: FormData): Promise<void> {
  const id = String(formData.get("taskId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !isTaskStatus(status)) return;
  const projectId = await changeTaskStatus(id, status);
  refreshProject(projectId);
}

export async function deleteTaskAction(formData: FormData): Promise<void> {
  const id = String(formData.get("taskId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  if (!id) return;
  await prisma.task.delete({ where: { id } });
  refreshProject(projectId);
}

async function touchProject(projectId: string) {
  if (!projectId) return;
  await prisma.project.update({ where: { id: projectId }, data: { updatedAt: new Date() } });
}

// --- Notizen ----------------------------------------------------------------

export async function addNoteAction(formData: FormData): Promise<void> {
  const parsed = noteSchema.safeParse({
    projectId: formData.get("projectId"),
    body: formData.get("body"),
  });
  if (!parsed.success) return;

  await prisma.note.create({ data: parsed.data });
  await touchProject(parsed.data.projectId);
  refreshProject(parsed.data.projectId);
}

export async function togglePinNoteAction(formData: FormData): Promise<void> {
  const id = String(formData.get("noteId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  if (!id) return;
  const note = await prisma.note.findUnique({ where: { id }, select: { pinned: true } });
  if (!note) return;
  await prisma.note.update({ where: { id }, data: { pinned: !note.pinned } });
  refreshProject(projectId);
}

export async function deleteNoteAction(formData: FormData): Promise<void> {
  const id = String(formData.get("noteId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  if (!id) return;
  await prisma.note.delete({ where: { id } });
  refreshProject(projectId);
}

// --- Dateien ----------------------------------------------------------------

export async function uploadFilesAction(formData: FormData): Promise<void> {
  const projectId = String(formData.get("projectId") ?? "");
  if (!projectId) return;

  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  for (const file of files) {
    if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) continue;
    const buffer = Buffer.from(await file.arrayBuffer());
    await addAttachment(projectId, file.name, file.type, buffer, "UPLOAD");
  }
  await touchProject(projectId);
  refreshProject(projectId);
}

export async function deleteAttachmentAction(formData: FormData): Promise<void> {
  const id = String(formData.get("attachmentId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  if (!id) return;

  const attachment = await prisma.attachment.findUnique({ where: { id } });
  if (!attachment) return;
  await prisma.attachment.delete({ where: { id } });
  await unlink(resolveStoragePath(attachment.storagePath)).catch(() => undefined);
  refreshProject(projectId);
}

// --- Mails ------------------------------------------------------------------

export async function unlinkMailAction(formData: FormData): Promise<void> {
  const id = String(formData.get("mailLinkId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  if (!id) return;
  await prisma.mailLink.delete({ where: { id } });
  refreshProject(projectId);
}

// --- Tags -------------------------------------------------------------------

export async function createTagAction(formData: FormData): Promise<void> {
  const parsed = tagSchema.safeParse({
    name: formData.get("name"),
    color: formData.get("color") || undefined,
  });
  if (!parsed.success) return;
  await prisma.tag.create({ data: parsed.data }).catch(() => undefined);
  revalidatePath("/vorlagen");
  revalidatePath("/projekte");
}

export async function deleteTagAction(formData: FormData): Promise<void> {
  const id = String(formData.get("tagId") ?? "");
  if (!id) return;
  await prisma.tag.delete({ where: { id } });
  revalidatePath("/vorlagen");
  revalidatePath("/projekte");
}

// --- Vorlagen ---------------------------------------------------------------

export async function createTemplateAction(formData: FormData): Promise<void> {
  const parsed = templateSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
  });
  if (!parsed.success) return;
  await prisma.template.create({
    data: { name: parsed.data.name, description: parsed.data.description || null },
  });
  revalidatePath("/vorlagen");
}

export async function updateTemplateAction(formData: FormData): Promise<void> {
  const id = String(formData.get("templateId") ?? "");
  const parsed = templateSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
  });
  if (!id || !parsed.success) return;
  await prisma.template.update({
    where: { id },
    data: { name: parsed.data.name, description: parsed.data.description || null },
  });
  revalidatePath("/vorlagen");
  revalidatePath(`/vorlagen/${id}`);
}

export async function deleteTemplateAction(formData: FormData): Promise<void> {
  const id = String(formData.get("templateId") ?? "");
  if (!id) return;
  await prisma.template.delete({ where: { id } });
  revalidatePath("/vorlagen");
  redirect("/vorlagen");
}

export async function addTemplatePhaseAction(formData: FormData): Promise<void> {
  const templateId = String(formData.get("templateId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!templateId || !title) return;

  const last = await prisma.templatePhase.aggregate({
    where: { templateId },
    _max: { position: true },
  });
  await prisma.templatePhase.create({
    data: { templateId, title, position: (last._max.position ?? 0) + 1 },
  });
  revalidatePath(`/vorlagen/${templateId}`);
}

export async function deleteTemplatePhaseAction(formData: FormData): Promise<void> {
  const id = String(formData.get("phaseId") ?? "");
  const templateId = String(formData.get("templateId") ?? "");
  if (!id) return;
  await prisma.templatePhase.delete({ where: { id } });
  revalidatePath(`/vorlagen/${templateId}`);
}

export async function addTemplateTaskAction(formData: FormData): Promise<void> {
  const templatePhaseId = String(formData.get("phaseId") ?? "");
  const templateId = String(formData.get("templateId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  if (!templatePhaseId || !title) return;

  const last = await prisma.templateTask.aggregate({
    where: { templatePhaseId },
    _max: { position: true },
  });
  await prisma.templateTask.create({
    data: {
      templatePhaseId,
      title,
      notes: notes || null,
      position: (last._max.position ?? 0) + 1,
    },
  });
  revalidatePath(`/vorlagen/${templateId}`);
}

export async function deleteTemplateTaskAction(formData: FormData): Promise<void> {
  const id = String(formData.get("taskId") ?? "");
  const templateId = String(formData.get("templateId") ?? "");
  if (!id) return;
  await prisma.templateTask.delete({ where: { id } });
  revalidatePath(`/vorlagen/${templateId}`);
}

export async function applyTemplateAction(formData: FormData): Promise<void> {
  const projectId = String(formData.get("projectId") ?? "");
  const templateId = String(formData.get("templateId") ?? "");
  if (!projectId || !templateId) return;
  await applyTemplateToProject(projectId, templateId);
  refreshProject(projectId);
}

export async function templateFromProjectAction(formData: FormData): Promise<void> {
  const projectId = String(formData.get("projectId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!projectId || !name) return;

  const template = await templateFromProject(projectId, name, description);
  revalidatePath("/vorlagen");
  redirect(`/vorlagen/${template.id}`);
}
