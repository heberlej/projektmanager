import { z } from "zod";
import { PRIORITY_ORDER, STATUS_ORDER, TAG_COLORS, TASK_STATUS_ORDER } from "./status";
import { parseLocalDateTime, PLANNED_KINDS } from "./planning";
import { RECURRENCES } from "./recurrence";

/**
 * Einzige Validierungsquelle - wird sowohl von den Server Actions der UI als
 * auch von den Route Handlern unter /api/addin benutzt.
 */

const trimmed = (max: number) => z.string().trim().max(max);
const requiredText = (max: number, feld: string) =>
  trimmed(max).min(1, { message: `${feld} darf nicht leer sein` });

export const statusSchema = z.enum(STATUS_ORDER);
export const prioritySchema = z.enum(PRIORITY_ORDER);
export const tagColorSchema = z.enum(TAG_COLORS);

export const idSchema = z.string().min(1).max(64);

export const projectCreateSchema = z.object({
  name: requiredText(200, "Projektname"),
  customer: requiredText(160, "Kunde"),
  status: statusSchema.default("NEU"),
  priority: prioritySchema.default("NORMAL"),
  description: trimmed(5000).optional().or(z.literal("")),
  templateId: idSchema.optional().or(z.literal("")),
  tagIds: z.array(idSchema).max(20).default([]),
});
export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;

export const projectUpdateSchema = projectCreateSchema
  .omit({ templateId: true })
  .partial()
  .extend({ id: idSchema });

export const phaseSchema = z.object({
  projectId: idSchema,
  title: requiredText(160, "Phasenname"),
});

export const taskStatusSchema = z.enum(TASK_STATUS_ORDER);

/** projectId ist optional: eine Aufgabe darf fuer sich stehen. */
export const taskSchema = z.object({
  projectId: idSchema.optional().or(z.literal("")),
  phaseId: idSchema.optional().or(z.literal("")),
  title: requiredText(300, "Aufgabe"),
  notes: trimmed(2000).optional().or(z.literal("")),
  status: taskStatusSchema.default("OFFEN"),
  priority: z.enum(PRIORITY_ORDER).default("NORMAL"),
  /**
   * Faelligkeit kommt als <input type="date"> ohne Uhrzeit. Auf 12:00 Ortszeit
   * gelegt, damit die Sommerzeitumstellung den Tag nicht kippen kann - um
   * Mitternacht waere der 29.03. je nach Zone der 28.
   */
  dueDate: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((value) => {
      if (!value) return null;
      const d = new Date(`${value}T12:00:00`);
      return Number.isNaN(d.getTime()) ? null : d;
    }),
  recurrence: z
    .enum(RECURRENCES)
    .optional()
    .or(z.literal(""))
    .transform((value) => (value ? (value as (typeof RECURRENCES)[number]) : null)),
});

export const noteSchema = z.object({
  projectId: idSchema,
  body: requiredText(20000, "Notiz"),
});

export const tagSchema = z.object({
  name: requiredText(60, "Tag-Name"),
  color: tagColorSchema.default("slate"),
});

export const templateSchema = z.object({
  name: requiredText(160, "Vorlagenname"),
  description: trimmed(2000).optional().or(z.literal("")),
});

// --- Geplante Termine -------------------------------------------------------

/**
 * Ein Termin ist entweder ganz gesetzt oder ganz leer. Ein halber Termin
 * (nur Beginn) waere im Kalender nicht darstellbar, deshalb wird er abgelehnt
 * statt stillschweigend ergaenzt.
 */
export const scheduleSchema = z
  .object({
    kind: z.enum(PLANNED_KINDS),
    id: idSchema,
    // Leer bei Aufgaben ohne Projekt - die gibt es seit dem Aufgabenboard.
    projectId: idSchema.optional().or(z.literal("")),
    start: trimmed(40).optional(),
    end: trimmed(40).optional(),
  })
  .transform((raw, ctx) => {
    const start = parseLocalDateTime(raw.start);
    const end = parseLocalDateTime(raw.end);

    const projectId = raw.projectId || null;

    if (!start && !end) {
      return { kind: raw.kind, id: raw.id, projectId, start: null, end: null };
    }
    if (!start || !end) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Bitte Beginn und Ende angeben – oder beide Felder leer lassen.",
      });
      return z.NEVER;
    }
    if (end.getTime() < start.getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Das Ende liegt vor dem Beginn.",
      });
      return z.NEVER;
    }
    return { kind: raw.kind, id: raw.id, projectId, start, end };
  });

export type ScheduleInput = z.infer<typeof scheduleSchema>;

// --- Add-in -----------------------------------------------------------------

/** Was Office.js aus dem geoeffneten Mail-Item liefert. */
export const mailSchema = z.object({
  internetMessageId: requiredText(998, "internetMessageId"),
  restId: trimmed(2048).optional().or(z.literal("")),
  subject: trimmed(500).default(""),
  fromAddress: trimmed(320).default(""),
  receivedAt: z.coerce.date(),
  deeplinkUrl: trimmed(2048).optional().or(z.literal("")),
});
export type MailInput = z.infer<typeof mailSchema>;

export const linkMailSchema = z.object({
  projectId: idSchema,
  mail: mailSchema,
});

export const projectFromMailSchema = z.object({
  project: projectCreateSchema,
  mail: mailSchema,
});

/**
 * Aufgabe aus dem Add-in. Projekt und Mail sind beide optional: eine Aufgabe
 * kann fuer sich stehen, und ob die Mail mit angeheftet wird, entscheidet der
 * Haken im Taskpane.
 */
export const addinTaskSchema = z.object({
  title: requiredText(300, "Aufgabe"),
  projectId: idSchema.optional().or(z.literal("")),
  notes: trimmed(2000).optional().or(z.literal("")),
  status: taskStatusSchema.default("OFFEN"),
  mail: mailSchema.optional(),
});

/** Anhaenge kommen aus Office.js als Base64. */
export const addinAttachmentSchema = z.object({
  projectId: idSchema,
  filename: requiredText(255, "Dateiname"),
  mime: trimmed(160).default("application/octet-stream"),
  contentBase64: z.string().min(1),
});

/** 32 MB - muss zu next.config.ts und Caddyfile passen. */
export const MAX_UPLOAD_BYTES = 32 * 1024 * 1024;

/** Formatiert Zod-Fehler zu einer lesbaren Zeile fuer die UI. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Ungueltige Eingabe";
}
