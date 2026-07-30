import { prisma } from "./db";
import { storeFile } from "./storage";
import type { MailInput, ProjectCreateInput } from "./validation";
import type { Prisma, PrismaClient } from "@prisma/client";
import { STALE_AFTER_DAYS, STATUS_ORDER, type Status } from "./status";

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
    by: ["projectId", "done"],
    where: { projectId: { in: projectIds } },
    _count: { _all: true },
  });

  for (const row of rows) {
    const entry = map.get(row.projectId) ?? { total: 0, done: 0 };
    entry.total += row._count._all;
    if (row.done) entry.done += row._count._all;
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
    project.phases.reduce((n, p) => n + p.tasks.filter((t) => t.done).length, 0) +
    project.tasks.filter((t) => t.done).length;

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
