/**
 * Geplante Termine und die Rechnerei fuer die Kalenderansicht.
 *
 * Bewusst ohne Import aus @prisma/client - diese Datei wird auch von Client-
 * Komponenten benutzt.
 *
 * Zeitzone: die App laeuft mit TZ=Europe/Berlin (siehe docker-compose.yml).
 * `datetime-local` liefert Ortszeit ohne Offset, `new Date(...)` liest das als
 * Ortszeit, und die Ausgabe geht ueber dieselbe Zone wieder zurueck. Damit
 * bleibt "22:00" auch nach dem Speichern 22:00.
 */

export const PLANNED_KINDS = ["PROJEKT", "PHASE", "AUFGABE"] as const;
export type PlannedKind = (typeof PLANNED_KINDS)[number];

export const KIND_LABEL: Record<PlannedKind, string> = {
  PROJEKT: "Projekt",
  PHASE: "Phase",
  AUFGABE: "Aufgabe",
};

/** Volle Klassen-Literale, damit Tailwind sie beim Scannen findet. */
export const KIND_CHIP: Record<PlannedKind, string> = {
  PROJEKT: "bg-blue-100 text-blue-900 ring-blue-300",
  PHASE: "bg-violet-100 text-violet-900 ring-violet-300",
  AUFGABE: "bg-slate-100 text-slate-800 ring-slate-300",
};

export const KIND_BAR: Record<PlannedKind, string> = {
  PROJEKT: "bg-blue-500",
  PHASE: "bg-violet-500",
  AUFGABE: "bg-slate-400",
};

export function isPlannedKind(value: unknown): value is PlannedKind {
  return typeof value === "string" && (PLANNED_KINDS as readonly string[]).includes(value);
}

// --- Umwandlung zwischen Date und <input type="datetime-local"> -------------

/** Leerer String -> null. Ungueltiges Datum -> null. */
export function parseLocalDateTime(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Date -> "2026-08-01T22:00" fuer defaultValue eines datetime-local-Feldes. */
export function toLocalInputValue(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// --- Anzeige ----------------------------------------------------------------

const timeFmt = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" });
const dayYearFmt = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
export const monthFmt = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" });

export function formatTime(value: Date | string): string {
  return timeFmt.format(new Date(value));
}

/**
 * "01.08.2026, 22:00 – 04:00" wenn am selben Tag,
 * sonst "01.08.2026, 22:00 – 02.08.2026, 04:00".
 */
export function formatRange(start: Date | string, end: Date | string): string {
  const a = new Date(start);
  const b = new Date(end);
  if (isSameDay(a, b)) {
    return `${dayYearFmt.format(a)}, ${timeFmt.format(a)} – ${timeFmt.format(b)}`;
  }
  return `${dayYearFmt.format(a)}, ${timeFmt.format(a)} – ${dayYearFmt.format(b)}, ${timeFmt.format(b)}`;
}

/** Dauer als "45 min", "3,5 h" oder "2 Tage". */
export function formatDuration(start: Date | string, end: Date | string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms <= 0) return "";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = ms / 3_600_000;
  if (hours < 24) {
    const rounded = Math.round(hours * 10) / 10;
    return `${String(rounded).replace(".", ",")} h`;
  }
  const days = Math.round((ms / 86_400_000) * 10) / 10;
  return `${String(days).replace(".", ",")} Tage`;
}

// --- Tages- und Monatsrechnerei --------------------------------------------

export function startOfDay(value: Date): Date {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(value: Date, days: number): Date {
  const d = new Date(value);
  d.setDate(d.getDate() + days);
  return d;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isToday(value: Date): boolean {
  return isSameDay(value, new Date());
}

export function formatDayShort(value: Date): string {
  return dayFmt.format(value);
}

/** Monat aus "2026-08"; alles Unbrauchbare faellt auf den aktuellen Monat zurueck. */
export function parseMonthParam(value: unknown): Date {
  const now = startOfDay(new Date());
  if (typeof value !== "string") return new Date(now.getFullYear(), now.getMonth(), 1);
  const match = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (!match) return new Date(now.getFullYear(), now.getMonth(), 1);
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return new Date(now.getFullYear(), now.getMonth(), 1);
  return new Date(year, month - 1, 1);
}

export function toMonthParam(value: Date): string {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}`;
}

export function addMonths(value: Date, months: number): Date {
  return new Date(value.getFullYear(), value.getMonth() + months, 1);
}

/**
 * Sichtbares Raster eines Monats: volle Wochen von Montag bis Sonntag,
 * damit das Gitter rechteckig bleibt.
 */
export function monthGrid(monthStart: Date): Date[][] {
  const first = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1);
  // getDay(): 0 = Sonntag. Wir wollen Montag als Wochenanfang.
  const offset = (first.getDay() + 6) % 7;
  const gridStart = addDays(first, -offset);

  const weeks: Date[][] = [];
  let cursor = gridStart;
  // Sechs Wochen decken jeden Monat ab; die letzte wird weggelassen, wenn leer.
  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(cursor);
      cursor = addDays(cursor, 1);
    }
    const gehoertZumMonat = week.some((day) => day.getMonth() === monthStart.getMonth());
    if (w === 5 && !gehoertZumMonat) break;
    weeks.push(week);
  }
  return weeks;
}

export const WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;

// --- Eintraege --------------------------------------------------------------

export type CalendarEntry = {
  id: string;
  kind: PlannedKind;
  title: string;
  /** Null bei Aufgaben ohne Projekt - die verlinken aufs Aufgabenboard. */
  projectId: string | null;
  projectName: string | null;
  customer: string | null;
  start: Date;
  end: Date;
  done: boolean;
};

/** Wohin ein Kalendereintrag fuehrt. */
export function entryHref(entry: CalendarEntry): string {
  return entry.projectId ? `/projekte/${entry.projectId}` : "/aufgaben";
}

/** Ueberlappt der Eintrag den Kalendertag? Ende ist einschliessend gemeint. */
export function overlapsDay(entry: { start: Date; end: Date }, day: Date): boolean {
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);
  return entry.start < dayEnd && entry.end >= dayStart;
}

/** Frueher Beginn zuerst, bei Gleichstand laengere Bloecke zuerst. */
export function byStart(a: CalendarEntry, b: CalendarEntry): number {
  const diff = a.start.getTime() - b.start.getTime();
  if (diff !== 0) return diff;
  return b.end.getTime() - a.end.getTime();
}
