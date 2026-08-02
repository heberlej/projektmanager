"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import {
  addAttachment,
  applyTemplatePhaseToProject,
  applyTemplateToProject,
  ausDemPapierkorb,
  changeProjectStatus,
  changeTaskStatus,
  createProject,
  createTask,
  inDenPapierkorb,
  setSchedule,
  setzeWiedervorlage,
  templateFromProject,
  wiedervorlageErledigt,
} from "./service";
import { resolveStoragePath } from "./storage";
import { datenVerzeichnis, istDesktop, manifestErzeugen } from "./addin-einrichtung";
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
  taskDetailsSchema,
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
    priority: formData.get("priority") || undefined,
    dueDate: formData.get("dueDate") ?? "",
    recurrence: formData.get("recurrence") ?? "",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  await createTask({
    title: parsed.data.title,
    projectId: null,
    notes: parsed.data.notes || null,
    status: parsed.data.status,
    priority: parsed.data.priority,
    dueDate: parsed.data.dueDate,
    recurrence: parsed.data.recurrence,
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
  // In den Papierkorb, nicht endgueltig - siehe service.inDenPapierkorb.
  await inDenPapierkorb("AUFGABE", id);
  refreshProject(projectId);
}

/** Setzt Prioritaet und Faelligkeit einer Aufgabe - auch fuer Projektaufgaben. */
export async function setTaskDetailsAction(formData: FormData): Promise<void> {
  const id = String(formData.get("taskId") ?? "");
  if (!id) return;

  const parsed = taskDetailsSchema.safeParse({
    priority: formData.get("priority") || undefined,
    dueDate: formData.get("dueDate") ?? "",
  });
  if (!parsed.success) return;

  const task = await prisma.task.update({
    where: { id },
    data: { priority: parsed.data.priority, dueDate: parsed.data.dueDate },
    select: { projectId: true },
  });
  refreshProject(task.projectId);
}

/** Sammelaktion aus der Tabelle: mehrere Aufgaben auf einmal. */
export async function bulkTaskAction(formData: FormData): Promise<void> {
  const ids = formData.getAll("auswahl").map(String).filter(Boolean);
  const was = String(formData.get("was") ?? "");
  if (ids.length === 0) return;

  if (was === "loeschen") {
    for (const id of ids) await inDenPapierkorb("AUFGABE", id);
  } else if (isTaskStatus(was)) {
    // Einzeln statt updateMany: changeTaskStatus haelt die Position in der
    // Zielspalte nach und legt Nachfolger wiederkehrender Aufgaben an.
    for (const id of ids) await changeTaskStatus(id, was);
  } else {
    return;
  }
  refreshProject(null);
}

// --- Outlook-Add-in (nur Windows-Fassung) -----------------------------------

export async function manifestErzeugenAction(): Promise<void> {
  if (!istDesktop()) return;
  await manifestErzeugen();
  revalidatePath("/einstellungen");
}

/**
 * Oeffnet den Ordner mit dem Manifest im Explorer. Nur in der Windows-Fassung,
 * und der Pfad kommt aus der eigenen Umgebung, nicht von aussen.
 */
export async function ordnerOeffnenAction(): Promise<void> {
  if (!istDesktop()) return;
  const { spawn } = await import("node:child_process");
  spawn("explorer.exe", [datenVerzeichnis()], { detached: true, stdio: "ignore" }).unref();
}

// --- Papierkorb -------------------------------------------------------------

export async function restoreAction(formData: FormData): Promise<void> {
  const art = String(formData.get("art") ?? "");
  const id = String(formData.get("id") ?? "");
  if (!id || (art !== "AUFGABE" && art !== "NOTIZ" && art !== "DATEI")) return;
  const projectId = await ausDemPapierkorb(art, id);
  refreshProject(projectId);
  revalidatePath("/papierkorb");
}

export async function purgeAction(formData: FormData): Promise<void> {
  const art = String(formData.get("art") ?? "");
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  if (art === "AUFGABE") await prisma.task.delete({ where: { id } });
  else if (art === "NOTIZ") await prisma.note.delete({ where: { id } });
  else if (art === "DATEI") {
    const datei = await prisma.attachment.findUnique({ where: { id } });
    if (!datei) return;
    await prisma.attachment.delete({ where: { id } });
    await unlink(resolveStoragePath(datei.storagePath)).catch(() => undefined);
  } else return;

  revalidatePath("/papierkorb");
}

// --- Wiedervorlage ----------------------------------------------------------

export async function setFollowUpAction(formData: FormData): Promise<void> {
  const id = String(formData.get("mailLinkId") ?? "");
  if (!id) return;
  const roh = String(formData.get("followUpAt") ?? "").trim();
  // Wie bei der Faelligkeit auf Mittag gelegt, damit keine Zeitumstellung den
  // Tag kippt.
  const am = roh ? new Date(`${roh}T12:00:00`) : null;
  const projectId = await setzeWiedervorlage(id, am && !Number.isNaN(am.getTime()) ? am : null);
  refreshProject(projectId);
}

export async function followUpDoneAction(formData: FormData): Promise<void> {
  const id = String(formData.get("mailLinkId") ?? "");
  if (!id) return;
  const projectId = await wiedervorlageErledigt(id);
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
  await inDenPapierkorb("NOTIZ", id);
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

  // Die Datei bleibt liegen, bis der Papierkorb sie endgueltig hergibt -
  // sonst waere Wiederherstellen eine leere Zusage.
  await inDenPapierkorb("DATEI", id);
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

/** Einzelne Phase einer Vorlage anhaengen - fuer Nacharbeit mitten im Projekt. */
export async function applyTemplatePhaseAction(formData: FormData): Promise<void> {
  const projectId = String(formData.get("projectId") ?? "");
  const templatePhaseId = String(formData.get("templatePhaseId") ?? "");
  if (!projectId || !templatePhaseId) return;
  await applyTemplatePhaseToProject(projectId, templatePhaseId);
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
