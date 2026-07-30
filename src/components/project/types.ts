import type { getProject } from "@/lib/service";

/** Was die Detailseite aus der Datenbank laedt. */
export type ProjectDetail = NonNullable<Awaited<ReturnType<typeof getProject>>>;
