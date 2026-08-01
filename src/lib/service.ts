import { prisma } from "./db";
import { storeFile } from "./storage";
import type { MailInput, ProjectCreateInput, ScheduleInput } from "./validation";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  STALE_AFTER_DAYS,
  STATUS_ORDER,
  TASK_DONE,
  TASK_STATUS_ORDER,
  type Priority,
  type Status,
  type TaskStatus,
} from "./status";
import { byStart, type CalendarEntry } from "./planning";
import { faelligkeitDesNachfolgers, type Recurrence } from "./recurrence";

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

/**
 * Haengt eine einzelne Phase einer Vorlage an ein laufendes Projekt an.
 *
 * Der haeufige Fall mitten im Projekt: die Nacharbeit kommt dazu, aber nicht
 * noch einmal die ganze Vorlage. Kopiert wird auch hier, nicht referenziert -
 * gleiche Ueberlegung wie bei copyTemplateInto.
 */
export async function applyTemplatePhaseToProject(projectId: string, templatePhaseId: string) {
  await prisma.$transaction(async (tx) => {
    const vorlagenphase = await tx.templatePhase.findUnique({
      where: { id: templatePhaseId },
      include: { tasks: { orderBy: { position: "asc" } } },
    });
    if (!vorlagenphase) return;

    const vorhanden = await tx.phase.aggregate({
      where: { projectId },
      _max: { position: true },
    });

    await tx.phase.create({
      data: {
        projectId,
        title: vorlagenphase.title,
        position: (vorhanden._max.position ?? 0) + 1,
        tasks: {
          create: vorlagenphase.tasks.map((task, index) => ({
            projectId,
            title: task.title,
            notes: task.notes,
            position: index + 1,
          })),
        },
      },
    });

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
  priority: Priority;
  notes: string | null;
  plannedStart: Date | null;
  plannedEnd: Date | null;
  dueDate: Date | null;
  recurrence: Recurrence | null;
};

export const FAELLIG_FILTER = ["alle", "ueberfaellig", "heute", "woche"] as const;
export type FaelligFilter = (typeof FAELLIG_FILTER)[number];

export type TaskFilter = {
  q?: string;
  faellig?: FaelligFilter;
};

/**
 * Grenzen fuer den Faelligkeitsfilter. Gerechnet wird auf Tagesgrenzen in
 * Ortszeit - "heute faellig" endet um Mitternacht, nicht 24 Stunden nach jetzt.
 */
function faelligkeitsGrenze(filter: FaelligFilter): Prisma.TaskWhereInput {
  if (filter === "alle") return {};
  const jetzt = new Date();
  const heuteEnde = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate(), 23, 59, 59, 999);

  if (filter === "ueberfaellig") {
    const heuteAnfang = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate());
    return { dueDate: { lt: heuteAnfang }, status: { not: TASK_DONE } };
  }
  if (filter === "heute") {
    return { dueDate: { lte: heuteEnde }, status: { not: TASK_DONE } };
  }
  // woche: die naechsten sieben Tage einschliesslich heute, Rueckstand inbegriffen
  const inSiebenTagen = new Date(heuteEnde.getTime() + 6 * 86_400_000);
  return { dueDate: { lte: inSiebenTagen }, status: { not: TASK_DONE } };
}

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
    deletedAt: null,
    ...faelligkeitsGrenze(filter.faellig ?? "alle"),
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
    // Faelligkeit schlaegt Prioritaet: was heute faellig ist, ist dringender als
    // was irgendwann wichtig ist. Undatiertes sortiert sich dahinter ein.
    orderBy: [
      { dueDate: { sort: "asc", nulls: "last" } },
      { priority: "desc" },
      { position: "asc" },
    ],
    select: boardTaskSelect,
  });

  return rows.map(toBoardTask);
}

const boardTaskSelect = {
  id: true,
  title: true,
  status: true,
  priority: true,
  notes: true,
  plannedStart: true,
  plannedEnd: true,
  dueDate: true,
  recurrence: true,
} satisfies Prisma.TaskSelect;

type BoardTaskRow = Prisma.TaskGetPayload<{ select: typeof boardTaskSelect }>;

function toBoardTask(t: BoardTaskRow): BoardTask {
  return {
    id: t.id,
    title: t.title,
    status: t.status as TaskStatus,
    priority: t.priority as Priority,
    notes: t.notes,
    plannedStart: t.plannedStart,
    plannedEnd: t.plannedEnd,
    dueDate: t.dueDate,
    recurrence: t.recurrence as Recurrence | null,
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
      deletedAt: null,
    },
    orderBy: [
      { dueDate: { sort: "asc", nulls: "last" } },
      { plannedStart: { sort: "asc", nulls: "last" } },
      { priority: "desc" },
      { updatedAt: "desc" },
    ],
    take: limit,
    select: boardTaskSelect,
  });
  return rows.map(toBoardTask);
}

async function nextTaskPosition(tx: Tx, status: TaskStatus): Promise<number> {
  const last = await tx.task.aggregate({ where: { status }, _max: { position: true } });
  return (last._max.position ?? 0) + 1;
}

/**
 * Statuswechsel einer Aufgabe; landet hinten in der Zielspalte.
 *
 * Wird eine wiederkehrende freie Aufgabe auf ERLEDIGT gesetzt, entsteht in
 * derselben Transaktion ihr Nachfolger. Die erledigte bleibt stehen - sie ist
 * der Beleg, dass es getan wurde.
 */
export async function changeTaskStatus(taskId: string, to: TaskStatus) {
  const current = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      status: true,
      projectId: true,
      title: true,
      notes: true,
      priority: true,
      dueDate: true,
      recurrence: true,
    },
  });
  if (!current || current.status === to) return current?.projectId ?? null;

  await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: taskId },
      data: { status: to, position: await nextTaskPosition(tx, to) },
    });

    if (to === TASK_DONE && current.recurrence && !current.projectId) {
      await tx.task.create({
        data: {
          title: current.title,
          notes: current.notes,
          priority: current.priority,
          recurrence: current.recurrence,
          status: "OFFEN",
          dueDate: faelligkeitDesNachfolgers(
            current.recurrence as Recurrence,
            current.dueDate,
          ),
          position: await nextTaskPosition(tx, "OFFEN"),
        },
      });
    }

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
  priority?: Priority;
  notes?: string | null;
  plannedStart?: Date | null;
  plannedEnd?: Date | null;
  dueDate?: Date | null;
  recurrence?: Recurrence | null;
  /** Herkunft: die Mail, aus der die Aufgabe entstanden ist. */
  mailLinkId?: string | null;
};

/**
 * Legt eine Aufgabe an - mit oder ohne Projekt. Eine Phase ohne Projekt gibt es
 * nicht, deshalb wird phaseId in dem Fall verworfen statt einen Fehler zu werfen.
 */
export async function createTask(data: TaskCreateData) {
  const projectId = data.projectId || null;
  const phaseId = projectId ? data.phaseId || null : null;
  const status = data.status ?? "OFFEN";
  // Wiederholung gibt es nur ohne Projekt: eine Projektaufgabe, die sich selbst
  // nachbildet, wuerde die Phasenstruktur unterlaufen.
  const recurrence = projectId ? null : (data.recurrence ?? null);

  return prisma.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        title: data.title,
        projectId,
        phaseId,
        status,
        priority: data.priority ?? "NORMAL",
        notes: data.notes || null,
        plannedStart: data.plannedStart ?? null,
        plannedEnd: data.plannedEnd ?? null,
        dueDate: data.dueDate ?? null,
        recurrence,
        mailLinkId: data.mailLinkId ?? null,
        position: await nextTaskPosition(tx, status),
      },
    });
    if (projectId) {
      await tx.project.update({ where: { id: projectId }, data: { updatedAt: new Date() } });
    }
    return task;
  });
}

// --- Papierkorb -------------------------------------------------------------

/** Wie lange Geloeschtes wiederherstellbar bleibt. */
export const PAPIERKORB_TAGE = 30;

export type PapierkorbArt = "AUFGABE" | "NOTIZ" | "DATEI";

export type PapierkorbEintrag = {
  art: PapierkorbArt;
  id: string;
  titel: string;
  projektName: string | null;
  projektId: string | null;
  geloeschtAm: Date;
};

/**
 * Loeschen heisst hier: als geloescht markieren. Erst nach PAPIERKORB_TAGE ist
 * es wirklich fort. Projekte haben dafuer schon das Archiv - was dort
 * verschwindet, ist ohnehin nie weg.
 */
export async function inDenPapierkorb(art: PapierkorbArt, id: string) {
  const jetzt = new Date();
  if (art === "AUFGABE") {
    const task = await prisma.task.update({ where: { id }, data: { deletedAt: jetzt } });
    return task.projectId;
  }
  if (art === "NOTIZ") {
    const note = await prisma.note.update({ where: { id }, data: { deletedAt: jetzt } });
    return note.projectId;
  }
  const datei = await prisma.attachment.update({ where: { id }, data: { deletedAt: jetzt } });
  return datei.projectId;
}

export async function ausDemPapierkorb(art: PapierkorbArt, id: string) {
  if (art === "AUFGABE") {
    const task = await prisma.task.update({ where: { id }, data: { deletedAt: null } });
    return task.projectId;
  }
  if (art === "NOTIZ") {
    const note = await prisma.note.update({ where: { id }, data: { deletedAt: null } });
    return note.projectId;
  }
  const datei = await prisma.attachment.update({ where: { id }, data: { deletedAt: null } });
  return datei.projectId;
}

export async function papierkorbInhalt(): Promise<PapierkorbEintrag[]> {
  const [tasks, notes, dateien] = await Promise.all([
    prisma.task.findMany({
      where: { deletedAt: { not: null } },
      select: { id: true, title: true, deletedAt: true, project: { select: { id: true, name: true } } },
    }),
    prisma.note.findMany({
      where: { deletedAt: { not: null } },
      select: { id: true, body: true, deletedAt: true, project: { select: { id: true, name: true } } },
    }),
    prisma.attachment.findMany({
      where: { deletedAt: { not: null } },
      select: { id: true, filename: true, deletedAt: true, project: { select: { id: true, name: true } } },
    }),
  ]);

  const eintraege: PapierkorbEintrag[] = [
    ...tasks.map((t) => ({
      art: "AUFGABE" as const,
      id: t.id,
      titel: t.title,
      projektName: t.project?.name ?? null,
      projektId: t.project?.id ?? null,
      geloeschtAm: t.deletedAt!,
    })),
    ...notes.map((n) => ({
      art: "NOTIZ" as const,
      id: n.id,
      titel: n.body.slice(0, 80) + (n.body.length > 80 ? " …" : ""),
      projektName: n.project.name,
      projektId: n.project.id,
      geloeschtAm: n.deletedAt!,
    })),
    ...dateien.map((d) => ({
      art: "DATEI" as const,
      id: d.id,
      titel: d.filename,
      projektName: d.project.name,
      projektId: d.project.id,
      geloeschtAm: d.deletedAt!,
    })),
  ];

  return eintraege.sort((a, b) => b.geloeschtAm.getTime() - a.geloeschtAm.getTime());
}

/**
 * Raeumt auf, was laenger als PAPIERKORB_TAGE im Papierkorb liegt. Laeuft beim
 * Oeffnen der Papierkorbseite - ein eigener Dienst dafuer waere ueberzogen, und
 * ohne Aufruf schadet das Liegenbleiben niemandem.
 *
 * Die Dateien im Ablageordner bleiben liegen: sie haengen am Projekt, nicht am
 * Datenbankeintrag, und ein verwaister Ordner ist harmloser als eine geloeschte
 * Datei, die noch gebraucht wird.
 */
export async function papierkorbBereinigen() {
  const grenze = new Date(Date.now() - PAPIERKORB_TAGE * 86_400_000);
  const [aufgaben, notizen, dateien] = await Promise.all([
    prisma.task.deleteMany({ where: { deletedAt: { lt: grenze } } }),
    prisma.note.deleteMany({ where: { deletedAt: { lt: grenze } } }),
    prisma.attachment.deleteMany({ where: { deletedAt: { lt: grenze } } }),
  ]);
  return aufgaben.count + notizen.count + dateien.count;
}

// --- Wiedervorlage ----------------------------------------------------------

/** Setzt oder loescht die Wiedervorlage an einer angehefteten Mail. */
export async function setzeWiedervorlage(mailLinkId: string, am: Date | null) {
  const link = await prisma.mailLink.update({
    where: { id: mailLinkId },
    data: { followUpAt: am, followUpDoneAt: null },
  });
  return link.projectId;
}

/** Hakt eine Wiedervorlage ab - der Vermerk bleibt als Historie stehen. */
export async function wiedervorlageErledigt(mailLinkId: string) {
  const link = await prisma.mailLink.update({
    where: { id: mailLinkId },
    data: { followUpDoneAt: new Date() },
  });
  return link.projectId;
}

export type Wiedervorlage = {
  id: string;
  subject: string;
  fromAddress: string;
  deeplinkUrl: string | null;
  followUpAt: Date;
  projektId: string;
  projektName: string;
};

/** Offene Wiedervorlagen, faellige zuerst. Archivierte Projekte bleiben aussen vor. */
export async function offeneWiedervorlagen(limit = 8): Promise<Wiedervorlage[]> {
  const rows = await prisma.mailLink.findMany({
    where: {
      followUpAt: { not: null },
      followUpDoneAt: null,
      project: { archived: false },
    },
    orderBy: { followUpAt: "asc" },
    take: limit,
    select: {
      id: true,
      subject: true,
      fromAddress: true,
      deeplinkUrl: true,
      followUpAt: true,
      project: { select: { id: true, name: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    subject: r.subject,
    fromAddress: r.fromAddress,
    deeplinkUrl: r.deeplinkUrl,
    followUpAt: r.followUpAt!,
    projektId: r.project.id,
    projektName: r.project.name,
  }));
}

// --- Volltextsuche ----------------------------------------------------------

export type SuchArt = "PROJEKT" | "NOTIZ" | "AUFGABE" | "MAIL" | "DATEI";

/** Marken um die Fundstellen - werden erst nach dem Escapen zu <b>. */
const TREFFER_AUF = "§§T§§";
const TREFFER_ZU = "§§/T§§";

/**
 * Macht aus dem Rohauszug sicheres HTML: erst alles escapen, dann die eigenen
 * Marken durch <b> ersetzen. Steht die Marke zufaellig im Text, wird daraus
 * hoechstens ueberfluessiges Fett - kein ausfuehrbarer Code.
 */
function auszugAlsHtml(roh: string): string {
  const sicher = roh
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
  return sicher.replaceAll(TREFFER_AUF, "<b>").replaceAll(TREFFER_ZU, "</b>");
}

export type SuchTreffer = {
  art: SuchArt;
  id: string;
  titel: string;
  auszug: string;
  href: string;
  archiviert: boolean;
};

type SuchZeile = {
  art: SuchArt;
  id: string;
  titel: string;
  auszug: string | null;
  projekt_id: string | null;
  archiviert: boolean;
  rang: number;
};

/**
 * Sucht ueber Projekte, Notizen und Aufgaben.
 *
 * Postgres-Volltext statt `contains`: damit findet "Migration" auch
 * "Migrationen", und die Rangfolge kommt aus der Datenbank statt aus einer
 * selbstgebauten Heuristik. Die tsvector-Spalten sind generiert (siehe
 * Migration 20260801173000), es gibt also nichts nachzupflegen.
 *
 * Archiviertes ist absichtlich dabei - "Archivieren statt Loeschen" waere sonst
 * die Haelfte wert. Die Treffer sind als solche gekennzeichnet.
 */
export async function suche(begriff: string, limit = 40): Promise<SuchTreffer[]> {
  const q = begriff.trim();
  if (!q) return [];

  // ts_headline setzt standardmaessig <b> um die Fundstellen und laesst HTML
  // aus den Daten unangetastet - eine Notiz mit <script> landete damit
  // ausfuehrbar in der Seite. Deshalb eigene Marken, die unten nach dem
  // Escapen durch <b> ersetzt werden.
  const kopf =
    "MaxWords=20, MinWords=6, ShortWord=3, MaxFragments=1, FragmentDelimiter=' … ', " +
    `StartSel=${TREFFER_AUF}, StopSel=${TREFFER_ZU}`;

  const zeilen = await prisma.$queryRaw<SuchZeile[]>`
    WITH frage AS (SELECT websearch_to_tsquery('german', ${q}) AS tsq)
    SELECT 'PROJEKT' AS art,
           p.id,
           p.name AS titel,
           ts_headline('german', concat_ws(' · ', p.customer, nullif(p.description, '')), frage.tsq, ${kopf}) AS auszug,
           p.id AS projekt_id,
           p.archived AS archiviert,
           ts_rank(p.suche, frage.tsq) AS rang
      FROM "Project" p, frage
     WHERE p.suche @@ frage.tsq

    UNION ALL

    SELECT 'NOTIZ' AS art,
           n.id,
           p.name AS titel,
           ts_headline('german', n.body, frage.tsq, ${kopf}) AS auszug,
           p.id AS projekt_id,
           p.archived AS archiviert,
           ts_rank(n.suche, frage.tsq) AS rang
      FROM "Note" n
      JOIN "Project" p ON p.id = n."projectId", frage
     WHERE n.suche @@ frage.tsq
       AND n."deletedAt" IS NULL

    UNION ALL

    SELECT 'AUFGABE' AS art,
           t.id,
           t.title AS titel,
           ts_headline('german', coalesce(nullif(t.notes, ''), t.title), frage.tsq, ${kopf}) AS auszug,
           t."projectId" AS projekt_id,
           coalesce(p.archived, false) AS archiviert,
           ts_rank(t.suche, frage.tsq) AS rang
      FROM "Task" t
      LEFT JOIN "Project" p ON p.id = t."projectId", frage
     WHERE t.suche @@ frage.tsq
       AND t."deletedAt" IS NULL

    UNION ALL

    SELECT 'MAIL' AS art,
           m.id,
           m.subject AS titel,
           ts_headline('german', concat_ws(' · ', m."fromAddress", p.name), frage.tsq, ${kopf}) AS auszug,
           p.id AS projekt_id,
           p.archived AS archiviert,
           ts_rank(m.suche, frage.tsq) AS rang
      FROM "MailLink" m
      JOIN "Project" p ON p.id = m."projectId", frage
     WHERE m.suche @@ frage.tsq

    UNION ALL

    SELECT 'DATEI' AS art,
           a.id,
           a.filename AS titel,
           ts_headline('german', p.name, frage.tsq, ${kopf}) AS auszug,
           p.id AS projekt_id,
           p.archived AS archiviert,
           ts_rank(a.suche, frage.tsq) AS rang
      FROM "Attachment" a
      JOIN "Project" p ON p.id = a."projectId", frage
     WHERE a.suche @@ frage.tsq
       AND a."deletedAt" IS NULL

     ORDER BY rang DESC, titel ASC
     LIMIT ${limit}
  `;

  return zeilen.map((z) => ({
    art: z.art,
    id: z.id,
    titel: z.titel,
    auszug: auszugAlsHtml((z.auszug ?? "").trim()),
    archiviert: z.archiviert,
    href:
      z.art === "AUFGABE" && !z.projekt_id
        ? "/aufgaben"
        : z.projekt_id
          ? `/projekte/${z.projekt_id}`
          : "/projekte",
  }));
}

/** Zaehlt die Spalten fuer die Kopfzeile des Boards - nur freie Aufgaben. */
export async function taskCountsByStatus(): Promise<Record<TaskStatus, number>> {
  const rows = await prisma.task.groupBy({
    by: ["status"],
    where: { projectId: null, deletedAt: null },
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
        deletedAt: null,
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
    where: { projectId: { in: projectIds }, deletedAt: null },
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
        include: {
          tasks: {
            where: { deletedAt: null },
            orderBy: { position: "asc" },
            include: { mailLink: { select: { subject: true, deeplinkUrl: true } } },
          },
        },
      },
      tasks: {
        where: { phaseId: null, deletedAt: null },
        orderBy: { position: "asc" },
        include: { mailLink: { select: { subject: true, deeplinkUrl: true } } },
      },
      notes: { where: { deletedAt: null }, orderBy: [{ pinned: "desc" }, { createdAt: "desc" }] },
      attachments: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
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
  const projects = await prisma.project.findMany({
    where,
    take,
    orderBy,
    include: { tags: { include: { tag: true } } },
  });

  // Fortschritt in einer zweiten Abfrage statt per include: gezaehlt wird ueber
  // Phasen- und phasenlose Aufgaben zusammen, das kann Prisma nicht mitliefern.
  const progress = await taskProgress(projects.map((p) => p.id));

  return projects.map((project) => ({
    ...project,
    progress: progress.get(project.id) ?? { total: 0, done: 0 },
  }));
}
