import Link from "next/link";
import { Suspense } from "react";
import { listCustomers, listProjects, listTags } from "@/lib/service";
import { isStatus } from "@/lib/status";
import { Board } from "@/components/board";
import { ProjectFilters } from "@/components/project-filters";
import { ProjectTable } from "@/components/project-table";
import { PROJEKT_SPALTEN, type ProjektSpalte } from "@/lib/tabellen";
import type { ProjectCardData } from "@/components/project-card";
import { EmptyState } from "@/components/ui";
import { leseSortierung } from "@/components/sortable";
import { STATUS_ORDER } from "@/lib/status";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function ProjectsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const q = one(params.q).trim();
  const kunde = one(params.kunde);
  const tag = one(params.tag);
  const statusParam = one(params.status);
  const archived = one(params.archiv) === "1";
  // Tabelle ist die Vorgabe; das Board kommt ueber ?ansicht=board dazu.
  const view = one(params.ansicht) === "board" ? "board" : "tabelle";

  const [projects, customers, tags] = await Promise.all([
    listProjects({
      q: q || undefined,
      customer: kunde || undefined,
      tagId: tag || undefined,
      status: isStatus(statusParam) ? statusParam : undefined,
      archived,
    }),
    listCustomers(),
    listTags(),
  ]);

  const sortierung = leseSortierung<ProjektSpalte>(params, PROJEKT_SPALTEN, {
    key: "zuletzt",
    richtung: "desc",
  });

  const cards: ProjectCardData[] = projects.map((project) => ({
    id: project.id,
    name: project.name,
    customer: project.customer,
    status: project.status,
    priority: project.priority,
    updatedAt: project.updatedAt,
    tags: project.tags.map((t) => ({ id: t.tag.id, name: t.tag.name, color: t.tag.color })),
    progress: project.progress,
    counts: {
      attachments: project._count.attachments,
      mailLinks: project._count.mailLinks,
      notes: project._count.notes,
    },
  }));

  /*
   * Sortiert wird hier, nicht in der Datenbank: der Fortschritt wird gerechnet
   * und steht dort gar nicht als Spalte. Bei dieser Groessenordnung ist das
   * belanglos - und es haelt die Regeln an einer Stelle beisammen.
   */
  const richtung = sortierung.richtung === "asc" ? 1 : -1;
  const sortiert = [...cards].sort((a, b) => {
    switch (sortierung.key) {
      case "name":
        return a.name.localeCompare(b.name, "de") * richtung;
      case "kunde":
        return (a.customer.localeCompare(b.customer, "de") || a.name.localeCompare(b.name, "de")) * richtung;
      case "status":
        return (STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)) * richtung;
      case "fortschritt": {
        const anteil = (p: ProjectCardData) =>
          p.progress.total === 0 ? -1 : p.progress.done / p.progress.total;
        return (anteil(a) - anteil(b)) * richtung;
      }
      case "zuletzt":
      default:
        // updatedAt ist Date oder ISO-String, je nachdem wer die Karte baut.
        return (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) * richtung;
    }
  });

  return (
    <div className="mx-auto max-w-[100rem]">
      {/* Klebende Werkzeugleiste: der Inhalt laeuft darunter weg, genau dort
          gehoert das Material hin. -mx/-px gleicht die Polsterung des Rahmens
          aus, damit die Leiste die volle Breite nimmt. */}
      <header className="glas-kante sticky top-0 z-20 -mx-4 mb-4 flex items-end justify-between gap-4 px-4 py-3 md:-mx-8 md:px-8">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {archived ? "Archiv" : "Projekte"}
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {cards.length} {cards.length === 1 ? "Projekt" : "Projekte"}
          </p>
        </div>
        <Link
          href="/projekte/neu"
          className="flex h-9 items-center rounded-full bg-akzent px-3.5 text-sm font-medium text-akzent-auf hover:bg-akzent-stark"
        >
          Neues Projekt
        </Link>
      </header>

      <Suspense fallback={null}>
        <ProjectFilters customers={customers} tags={tags} />
      </Suspense>

      {cards.length === 0 ? (
        <EmptyState
          title="Keine Projekte gefunden"
          hint={q || kunde || tag || statusParam ? "Filter zurücksetzen oder Suchbegriff ändern." : undefined}
        />
      ) : view === "tabelle" ? (
        <ProjectTable projects={sortiert} params={params} sortierung={sortierung} />
      ) : (
        <Board projects={cards} />
      )}
    </div>
  );
}
