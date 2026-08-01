import { prisma } from "@/lib/db";

/**
 * Leert alle Fachtabellen. Reihenfolge egal, weil TRUNCATE ... CASCADE die
 * Fremdschluessel mitnimmt; _prisma_migrations bleibt selbstverstaendlich stehen.
 */
export async function datenbankLeeren() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "StatusEvent", "MailLink", "Attachment", "Note", "Task", "Phase",
      "ProjectTag", "Project", "Tag", "TemplateTask", "TemplatePhase", "Template"
    RESTART IDENTITY CASCADE
  `);
}

export async function projektAnlegen(name = "Testprojekt", customer = "Testkunde") {
  return prisma.project.create({ data: { name, customer } });
}
