import { prisma } from "./db";
import { storeFile } from "./storage";
import type { MailInput, ProjectCreateInput, ScheduleInput } from "./validation";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  STALE_AFTER_DAYS,
  STATUS_ORDER,
  TASK_DONE,
  TASK_STATUS_ORDER,
  type Status,
  type TaskStatus,
} from "./status";
import { byStart, type CalendarEntry } from "./planning";

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

/**
 * Fachlogik, die sowohl die UI (Server Actions) als auch das Add-in
 * (Route Handler unter /api/addin) benutzt. Keine "use server"-Datei, damit
 * hier auch nicht-Action-Helfer stehen duerfen.
 */

// --- Projekte ---------------------------------------------------------------

export async function createProject(input: ProjectCreateInput) {
  const templateId = input.templateId ? input.templateId : null;

  return prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        name: input.name,
        customer: input.customer,
        status: input.status,
        priority: input.priority,
        description: input.description || null,
        templateId,
        position: await nextBoardPosition(tx, input.status),
        tags: {
          create: input.tagIds.map((tagId) => ({ tagId })),
        },
        statusEvents: {
          create: { from: null, to: input.status },
        },
      },
    });

    if (templateId) {
      await copyTemplateInto(tx, project.id, templateId);
    }

    return project;
  });
}

async function nextBoardPosition(tx: Tx, status: Status): Promise<number> {
  const last = await tx.project.aggregate({
    where: { status, archived: false },
    _max: { position: true },
  });
  return (last._max.position ?? 0) + 1;
}

/**
 * Kopiert Phasen und Aufgaben einer Vorlage an ein Projekt an. Bestehende
 * Phasen bleiben unangetastet - die Vorlage wird hinten angehaengt.
 */
export async function copyTemplateInto(tx: Tx, projectId: string, templateId: string) {
  const template = await tx.template.findUnique({
    where: { id: templateId },
    include: {
      phases: {
        orderBy: { position: "asc" },
        include: { tasks: { orderBy: { position: "asc" } } },
      },
    },
  });
  if (!template) return;

  const existing = await tx.phase.aggregate({
    where: { projectId },
    _max: { position: true },
  });
  let phasePos = (existing._max.position ?? 0) + 1;

  for (const phase of template.phases) {
    await tx.phase.create({
      data: {
        projectId,
        title: phase.title,
        position: phasePos++,
        tasks: {
          create: phase.tasks.map((task, index) => ({
            projectId,
            title: task.title,
            notes: task.notes,
            position: index + 1,
          })),
        },
      },
    });
  }
}

export async function applyTemplateToProject(projectId: string, templateId: string) {
  await prisma.$transaction(async (tx) => {
    await copyTemplateInto(tx, projectId, templateId);
    await tx.project.update({ where: { id: projectId }, data: { updatedAt: new Date() } });
  });
}

/** Statuswechsel inklusive Protokolleintrag. */
export async function changeProjectStatus(projectId: string, to: Status) {
  const current = await prisma.project.findUnique({
    where: { id: projectId },
    select: { status: true },
  });
  if (!current || current.status === to) return;

  await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: projectId },
      data: { status: to, position: await nextBoardPosition(tx, to) },
    });
    await tx.statusEvent.create({
      data: { projectId, from: current.status, to },
    });
  });
}

/** Erzeugt aus einem laufenden Projekt eine wiederverwendbare Vorlage. */
export async function templateFromProject(projectId: string, name: string, description?: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      phases: {
        orderBy: { position: "asc" },
        include: { tasks: { orderBy: { position: "asc" } } },
      },
    },
  });
  if (!project) throw new Error("Projekt nicht gefunden");

  return prisma.template.create({
    data: {
      name,
      description: description || null,
      phases: {
        create: project.phases.map((phase) => ({
          title: phase.title,
          position: phase.position,
          tasks: {
            create: phase.tasks.map((task) => ({
              title: task.title,
              notes: task.notes,
              position: task.position,
            })),
          },
        })),
      },
    },
  });
}

// --- Aufgaben und Aufgabenboard ---------------------------------------------

export type BoardTask = {
  id: string;
  title: string;
  status: TaskStatus;
  notes: string | null;
  plannedStart: Date | null;
  plannedEnd: Date | null;
};

export type TaskFilter = {
  q?: string;
};

/**
 * Die freien Aufgaben fuer das Board unter /aufgaben.
 *
 * Freie Aufgaben und Projektaufgaben sind zwei getrennte Welten: was an einem
 * Projekt haengt, lebt in dessen Aufgabenliste und taucht hier nicht auf. Der
 * Filter ist deshalb `projectId: null` und nicht verhandelbar - er steht hier
 * in der Fachlogik, damit ihn keine Ansicht versehentlich aufweichen kann.
 */
export async function listBoardTasks(filter: TaskFilter = {}): Promise<BoardTask[]> {
  const where: Prisma.TaskWhereInput = {
    projectId: null,
    ...(filter.q
      ? {
          OR: [
            { title: { contains: filter.q, mode: "insensitive" } },
            { notes: { contains: filter.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const rows = await prisma.task.findMany({
    where,
    orderBy: [{ position: "asc" }, { updatedAt: "desc" }],
    select: boardTaskSelect,
  });

  return rows.map(toBoardTask);
}

const boardTaskSelect = {
  id: true,
  title: true,
  status: true,
  notes: true,
  plannedStart: true,
  plannedEnd: true,
} satisfies Prisma.TaskSelect;

type BoardTaskRow = Prisma.TaskGetPayload<{ select: typeof boardTaskSelect }>;

function toBoardTask(t: BoardTaskRow): BoardTask {
  return {
    id: t.id,
    title: t.title,
    status: t.status as TaskStatus,
    notes: t.notes,
    plannedStart: t.plannedStart,
    plannedEnd: t.plannedEnd,
  };
}

/**
 * Offene freie Aufgaben fuers Dashboard. Terminiertes zuerst, danach das
 * zuletzt Angefasste - was ohne Termin herumliegt, soll nicht die Liste
 * verstopfen. Projektaufgaben bleiben aussen vor, genau wie unter /aufgaben;
 * ihr Stand steht im Fortschritt der Projektkacheln.
 */
export async function openTasksForDashboard(limit = 8): Promise<BoardTask[]> {
  const rows = await prisma.task.findMany({
    where: {
      status: { not: TASK_DONE },
      projectId: null,
    },
    orderBy: [{ plannedStart: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }],
    take: limit,
    select: boardTaskSelect,
  });
  return rows.map(toBoardTask);
}

async function nextTaskPosition(tx: Tx, status: TaskStatus): Promise<number> {
  const last = await tx.task.aggregate({ where: { status }, _max: { position: true } });
  return (last._max.position ?? 0) + 1;
}

/** Statuswechsel einer Aufgabe; landet hinten in der Zielspalte. */
export async function changeTaskStatus(taskId: string, to: TaskStatus) {
  const current = await prisma.task.findUnique({
    where: { id: taskId },
    select: { status: true, projectId: true },
  });
  if (!current || current.status === to) return current?.projectId ?? null;

  await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: taskId },
      data: { status: to, position: await nextTaskPosition(tx, to) },
    });
    if (current.projectId) {
      await tx.project.update({ where: { id: current.projectId }, data: { updatedAt: new Date() } });
    }
  });
  return current.projectId;
}

export type TaskCreateData = {
  title: string;
  projectId?: string | null;
  phaseId?: string | null;
  status?: TaskStatus;
  notes?: string | null;
  plannedStart?: Date | null;
  plannedEnd?: Date | null;
};

/**
 * Legt eine Aufgabe an - mit oder ohne Projekt. Eine Phase ohne Projekt gibt es
 * nicht, deshalb wird phaseId in dem Fall verworfen statt einen Fehler zu werfen.
 */
export async function createTask(data: TaskCreateData) {
  const projectId = data.projectId || null;
  const phaseId = projectId ? data.phaseId || null : null;
  const status = data.status ?? "OFFEN";

  return prisma.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        title: data.title,
        projectId,
        phaseId,
        status,
        notes: data.notes || null,
        plannedStart: data.plannedStart ?? null,
        plannedEnd: data.plannedEnd ?? null,
        position: await nextTaskPosition(tx, status),
      },
    });
    if (projectId) {
      await tx.project.update({ where: { id: projectId }, data: { updatedAt: new Date() } });
    }
    return task;
  });
}

/** Zaehlt die Spalten fuer die Kopfzeile des Boards - nur freie Aufgaben. */
export async function taskCountsByStatus(): Promise<Record<TaskStatus, number>> {
  const rows = await prisma.task.groupBy({
    by: ["status"],
    where: { projectId: null },
    _count: { _all: true },
  });
  const counts = Object.fromEntries(TASK_STATUS_ORDER.map((s) => [s, 0])) as Record<TaskStatus, number>;
  for (const row of rows) counts[row.status as TaskStatus] = row._count._all;
  return counts;
}

// --- Geplante Termine -------------------------------------------------------

/** Setzt oder loescht den geplanten Termin eines Projekts, einer Phase oder einer Aufgabe. */
export async function setSchedule(input: ScheduleInput) {
  const data = { plannedStart: input.start, plannedEnd: input.end };

  switch (input.kind) {
    case "PROJEKT":
      await prisma.project.update({ where: { id: input.id }, data });
      return;
    case "PHASE":
      await prisma.phase.update({ where: { id: input.id }, data });
      return;
    case "AUFGABE":
      await prisma.task.update({ where: { id: input.id }, data });
      return;
  }
}

/** Nur Eintraege mit vollstaendigem Termin - halbe gibt es laut Schema nicht. */
const terminiert = {
  plannedStart: { not: null },
  plannedEnd: { not: null },
} satisfies Prisma.ProjectWhereInput;

const projektSelect = { select: { id: true, name: true, customer: true } };

/**
 * Alle Termine, die sich mit [from, to) ueberschneiden - also auch Bloecke, die
 * vor dem Zeitraum beginnen und hineinragen. Archivierte Projekte bleiben aussen vor.
 */
export async function calendarEntries(from: Date, to: Date): Promise<CalendarEntry[]> {
  const ueberlappt = { plannedStart: { lt: to }, plannedEnd: { gte: from } };

  const [projects, phases, tasks] = await Promise.all([
    prisma.project.findMany({
      where: { archived: false, ...terminiert, ...ueberlappt },
      select: {
        id: true,
        name: true,
        customer: true,
        status: true,
        plannedStart: true,
        plannedEnd: true,
      },
    }),
    prisma.phase.findMany({
      where: { project: { archived: false }, ...terminiert, ...ueberlappt },
      select: { id: true, title: true, plannedStart: true, plannedEnd: true, project: projektSelect },
    }),
    prisma.task.findMany({
      // Aufgaben ohne Projekt gehoeren mit in den Kalender - sie koennen per
      // Definition nicht zu einem archivierten Projekt gehoeren.
      where: {
        OR: [{ project: { archived: false } }, { projectId: null }],
        ...terminiert,
        ...ueberlappt,
      },
      select: {
        id: true,
        title: true,
        status: true,
        plannedStart: true,
        plannedEnd: true,
        project: projektSelect,
      },
    }),
  ]);

  const entries: CalendarEntry[] = [
    ...projects.map((p) => ({
      id: p.id,
      kind: "PROJEKT" as const,
      title: p.name,
      projectId: p.id,
      projectName: p.name,
      customer: p.customer,
      start: p.plannedStart!,
      end: p.plannedEnd!,
      done: p.status === "ABGESCHLOSSEN",
    })),
    ...phases.map((p) => ({
      id: p.id,
      kind: "PHASE" as const,
      title: p.title,
      projectId: p.project.id,
      projectName: p.project.name,
      customer: p.project.customer,
      start: p.plannedStart!,
      end: p.plannedEnd!,
      done: false,
    })),
    ...tasks.map((t) => ({
      id: t.id,
      kind: "AUFGABE" as const,
      title: t.title,
      projectId: t.project?.id ?? null,
      projectName: t.project?.name ?? null,
      customer: t.project?.customer ?? null,
      start: t.plannedStart!,
      end: t.plannedEnd!,
      done: t.status === TASK_DONE,
    })),
  ];

  return entries.sort(byStart);
}

/** Was als Naechstes ansteht - alles, dessen Ende noch nicht vorbei ist. */
export async function upcomingEntries(limit = 8): Promise<CalendarEntry[]> {
  const jetzt = new Date();
  const entries = await calendarEntries(jetzt, new Date(jetzt.getTime() + 365 * 86_400_000));
  return entries.filter((e) => !e.done).slice(0, limit);
}

// --- Mails ------------------------------------------------------------------

/**
 * Heftet eine Mail an ein Projekt. Idempotent ueber internetMessageId: dieselbe
 * Mail zweimal anzuheften erzeugt kein Duplikat, sondern aktualisiert nur die
 * Zuordnung.
 */
export async function linkMail(projectId: string, mail: MailInput) {
  const data = {
    projectId,
    restId: mail.restId || null,
    subject: mail.subject || "(kein Betreff)",
    fromAddress: mail.fromAddress || "",
    receivedAt: mail.receivedAt,
    deeplinkUrl: mail.deeplinkUrl || null,
  };

  return prisma.mailLink.upsert({
    where: { internetMessageId: mail.internetMessageId },
    create: { ...data, internetMessageId: mail.internetMessageId },
    update: data,
  });
}

// --- Dateien ----------------------------------------------------------------

export async function addAttachment(
  projectId: string,
  filename: string,
  mime: string,
  data: Buffer,
  source: "UPLOAD" | "OUTLOOK",
) {
  const stored = await storeFile(projectId, filename, data);
  return prisma.attachment.create({
    data: {
      projectId,
      filename: stored.filename,
      mime: mime || "application/octet-stream",
      sizeBytes: stored.sizeBytes,
      storagePath: stored.storagePath,
      source,
    },
  });
}

// --- Abfragen fuer die Oberflaeche ------------------------------------------

export type ProjectListItem = Awaited<ReturnType<typeof listProjects>>[number];

const listInclude = {
  tags: { include: { tag: true } },
  _count: { select: { attachments: true, mailLinks: true, notes: true } },
} satisfies Prisma.ProjectInclude;

export type ProjectFilter = {
  q?: string;
  customer?: string;
  tagId?: string;
  status?: Status;
  archived?: boolean;
};

export async function listProjects(filter: ProjectFilter = {}) {
  const where: Prisma.ProjectWhereInput = {
    archived: filter.archived ?? false,
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.customer ? { customer: filter.customer } : {}),
    ...(filter.tagId ? { tags: { some: { tagId: filter.tagId } } } : {}),
    ...(filter.q
      ? {
          OR: [
            { name: { contains: filter.q, mode: "insensitive" } },
            { customer: { contains: filter.q, mode: "insensitive" } },
            { description: { contains: filter.q, mode: "insensitive" } },
            { notes: { some: { body: { contains: filter.q, mode: "insensitive" } } } },
            { mailLinks: { some: { subject: { contains: filter.q, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };

  const projects = await prisma.project.findMany({
    where,
    include: listInclude,
    orderBy: [{ position: "asc" }, { updatedAt: "desc" }],
  });

  const progress = await taskProgress(projects.map((p) => p.id));

  return projects.map((project) => ({
    ...project,
    progress: progress.get(project.id) ?? { total: 0, done: 0 },
  }));
}

/** Fortschritt wird immer aus den Aufgaben abgeleitet, nie gespeichert. */
async function taskProgress(projectIds: string[]) {
  const map = new Map<string, { total: number; done: number }>();
  if (projectIds.length === 0) return map;

  const rows = await prisma.task.groupBy({
    by: ["projectId", "status"],
    where: { projectId: { in: projectIds } },
    _count: { _all: true },
  });

  for (const row of rows) {
    if (!row.projectId) continue; // kann hier nicht vorkommen, beruhigt aber den Typ
    const entry = map.get(row.projectId) ?? { total: 0, done: 0 };
    entry.total += row._count._all;
    if (row.status === TASK_DONE) entry.done += row._count._all;
    map.set(row.projectId, entry);
  }
  return map;
}

export async function getProject(id: string) {
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      tags: { include: { tag: true } },
      template: { select: { id: true, name: true } },
      phases: {
        orderBy: { position: "asc" },
        include: { tasks: { orderBy: { position: "asc" } } },
      },
      tasks: {
        where: { phaseId: null },
        orderBy: { position: "asc" },
      },
      notes: { orderBy: [{ pinned: "desc" }, { createdAt: "desc" }] },
      attachments: { orderBy: { createdAt: "desc" } },
      mailLinks: { orderBy: { receivedAt: "desc" } },
      statusEvents: { orderBy: { changedAt: "desc" }, take: 20 },
    },
  });
  if (!project) return null;

  const total = project.phases.reduce((n, p) => n + p.tasks.length, 0) + project.tasks.length;
  const done =
    project.phases.reduce((n, p) => n + p.tasks.filter((t) => t.status === TASK_DONE).length, 0) +
    project.tasks.filter((t) => t.status === TASK_DONE).length;

  return { ...project, progress: { total, done } };
}

export async function listCustomers(): Promise<string[]> {
  const rows = await prisma.project.findMany({
    distinct: ["customer"],
    select: { customer: true },
    orderBy: { customer: "asc" },
  });
  return rows.map((r) => r.customer).filter(Boolean);
}

export async function listTags() {
  return prisma.tag.findMany({ orderBy: { name: "asc" } });
}

export async function listTemplates() {
  return prisma.template.findMany({
    orderBy: { name: "asc" },
    include: {
      phases: {
        orderBy: { position: "asc" },
        include: { tasks: { orderBy: { position: "asc" } } },
      },
      _count: { select: { projects: true } },
    },
  });
}

export async function dashboardData() {
  const [counts, recent, stale, archivedCount] = await Promise.all([
    prisma.project.groupBy({
      by: ["status"],
      where: { archived: false },
      _count: { _all: true },
    }),
    listProjectsSlim({ archived: false }, 8, { updatedAt: "desc" }),
    listProjectsSlim(
      {
        archived: false,
        status: { notIn: ["ABGESCHLOSSEN"] },
        updatedAt: { lt: new Date(Date.now() - STALE_AFTER_DAYS * 86_400_000) },
      },
      10,
      { updatedAt: "asc" },
    ),
    prisma.project.count({ where: { archived: true } }),
  ]);

  const byStatus = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<Status, number>;
  for (const row of counts) byStatus[row.status as Status] = row._count._all;

  return { byStatus, recent, stale, archivedCount };
}

async function listProjectsSlim(
  where: Prisma.ProjectWhereInput,
  take: number,
  orderBy: Prisma.ProjectOrderByWithRelationInput,
) {
  return prisma.project.findMany({
    where,
    take,
    orderBy,
    include: { tags: { include: { tag: true } } },
  });
}
