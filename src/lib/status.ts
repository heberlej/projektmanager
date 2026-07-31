/**
 * Statuswerte, Prioritaeten und Farbzuordnungen.
 *
 * Bewusst ohne Import aus @prisma/client: diese Datei wird auch von Client-
 * Komponenten benutzt, und der Prisma-Client darf nicht ins Browser-Bundle.
 * Die Reihenfolge hier ist zugleich die Spaltenreihenfolge im Board.
 */

export const STATUS_ORDER = [
  "NEU",
  "IN_PLANUNG",
  "IN_ARBEIT",
  "WARTET_AUF_KUNDE",
  "BLOCKIERT",
  "ABGESCHLOSSEN",
] as const;

export type Status = (typeof STATUS_ORDER)[number];

export const STATUS_LABEL: Record<Status, string> = {
  NEU: "Neu",
  IN_PLANUNG: "In Planung",
  IN_ARBEIT: "In Arbeit",
  WARTET_AUF_KUNDE: "Wartet auf Kunde",
  BLOCKIERT: "Blockiert",
  ABGESCHLOSSEN: "Abgeschlossen",
};

/** Volle Klassen-Literale, damit Tailwind sie beim Scannen findet. */
export const STATUS_BADGE: Record<Status, string> = {
  NEU: "bg-slate-100 text-slate-700 ring-slate-300",
  IN_PLANUNG: "bg-indigo-100 text-indigo-800 ring-indigo-300",
  IN_ARBEIT: "bg-blue-100 text-blue-800 ring-blue-300",
  WARTET_AUF_KUNDE: "bg-amber-100 text-amber-900 ring-amber-300",
  BLOCKIERT: "bg-rose-100 text-rose-800 ring-rose-300",
  ABGESCHLOSSEN: "bg-emerald-100 text-emerald-800 ring-emerald-300",
};

export const STATUS_DOT: Record<Status, string> = {
  NEU: "bg-slate-400",
  IN_PLANUNG: "bg-indigo-500",
  IN_ARBEIT: "bg-blue-500",
  WARTET_AUF_KUNDE: "bg-amber-500",
  BLOCKIERT: "bg-rose-500",
  ABGESCHLOSSEN: "bg-emerald-500",
};

export const STATUS_BAR: Record<Status, string> = {
  NEU: "bg-slate-400",
  IN_PLANUNG: "bg-indigo-500",
  IN_ARBEIT: "bg-blue-500",
  WARTET_AUF_KUNDE: "bg-amber-500",
  BLOCKIERT: "bg-rose-500",
  ABGESCHLOSSEN: "bg-emerald-500",
};

export function isStatus(value: unknown): value is Status {
  return typeof value === "string" && (STATUS_ORDER as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------

/**
 * Zustaende einer Aufgabe. Die Reihenfolge ist zugleich die Spaltenreihenfolge
 * im Aufgabenboard. "Erledigt" ist ein Status, kein zusaetzliches Flag.
 */
export const TASK_STATUS_ORDER = ["OFFEN", "IN_ARBEIT", "WARTET", "ERLEDIGT"] as const;

export type TaskStatus = (typeof TASK_STATUS_ORDER)[number];

/** Der eine Zustand, der als erledigt zaehlt - fuer Fortschritt und Filter. */
export const TASK_DONE: TaskStatus = "ERLEDIGT";

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  OFFEN: "Offen",
  IN_ARBEIT: "In Arbeit",
  WARTET: "Wartet",
  ERLEDIGT: "Erledigt",
};

export const TASK_STATUS_BADGE: Record<TaskStatus, string> = {
  OFFEN: "bg-slate-100 text-slate-700 ring-slate-300",
  IN_ARBEIT: "bg-blue-100 text-blue-800 ring-blue-300",
  WARTET: "bg-amber-100 text-amber-900 ring-amber-300",
  ERLEDIGT: "bg-emerald-100 text-emerald-800 ring-emerald-300",
};

export const TASK_STATUS_DOT: Record<TaskStatus, string> = {
  OFFEN: "bg-slate-400",
  IN_ARBEIT: "bg-blue-500",
  WARTET: "bg-amber-500",
  ERLEDIGT: "bg-emerald-500",
};

export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" && (TASK_STATUS_ORDER as readonly string[]).includes(value);
}

/** Klick auf das Kaestchen schaltet zwischen offen und erledigt hin und her. */
export function toggledTaskStatus(current: TaskStatus): TaskStatus {
  return current === TASK_DONE ? "OFFEN" : TASK_DONE;
}

// ---------------------------------------------------------------------------

export const PRIORITY_ORDER = ["NIEDRIG", "NORMAL", "HOCH"] as const;
export type Priority = (typeof PRIORITY_ORDER)[number];

export const PRIORITY_LABEL: Record<Priority, string> = {
  NIEDRIG: "Niedrig",
  NORMAL: "Normal",
  HOCH: "Hoch",
};

export const PRIORITY_BADGE: Record<Priority, string> = {
  NIEDRIG: "bg-slate-100 text-slate-600 ring-slate-300",
  NORMAL: "bg-slate-100 text-slate-700 ring-slate-300",
  HOCH: "bg-orange-100 text-orange-800 ring-orange-300",
};

// ---------------------------------------------------------------------------

/** Erlaubte Tag-Farben. Der Wert steht in Tag.color. */
export const TAG_COLORS = [
  "slate",
  "blue",
  "violet",
  "cyan",
  "emerald",
  "amber",
  "orange",
  "rose",
] as const;

export type TagColor = (typeof TAG_COLORS)[number];

export const TAG_CHIP: Record<TagColor, string> = {
  slate: "bg-slate-100 text-slate-700 ring-slate-300",
  blue: "bg-blue-100 text-blue-800 ring-blue-300",
  violet: "bg-violet-100 text-violet-800 ring-violet-300",
  cyan: "bg-cyan-100 text-cyan-800 ring-cyan-300",
  emerald: "bg-emerald-100 text-emerald-800 ring-emerald-300",
  amber: "bg-amber-100 text-amber-900 ring-amber-300",
  orange: "bg-orange-100 text-orange-800 ring-orange-300",
  rose: "bg-rose-100 text-rose-800 ring-rose-300",
};

export function tagChipClass(color: string): string {
  return TAG_CHIP[(color as TagColor) in TAG_CHIP ? (color as TagColor) : "slate"];
}

/** Projekte ohne Bewegung seit mehr als so vielen Tagen gelten als liegengeblieben. */
export const STALE_AFTER_DAYS = 14;
