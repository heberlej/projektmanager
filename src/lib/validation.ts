import { z } from "zod";
import { PRIORITY_ORDER, STATUS_ORDER, TAG_COLORS } from "./status";

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

export const taskSchema = z.object({
  projectId: idSchema,
  phaseId: idSchema.optional().or(z.literal("")),
  title: requiredText(300, "Aufgabe"),
  notes: trimmed(2000).optional().or(z.literal("")),
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
