import Link from "next/link";
import { Suspense } from "react";
import { listCustomers, listProjects, listTags } from "@/lib/service";
import { isStatus } from "@/lib/status";
import { Board } from "@/components/board";
import { ProjectFilters } from "@/components/project-filters";
import { ProjectTable } from "@/components/project-table";
import type { ProjectCardData } from "@/components/project-card";
import { EmptyState } from "@/components/ui";

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

  return (
    <div className="mx-auto max-w-[100rem]">
      <header className="mb-4 flex items-end justify-between gap-4">
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
          className="flex h-9 items-center rounded-md bg-akzent px-3.5 text-sm font-medium text-akzent-auf hover:bg-akzent-stark"
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
        <ProjectTable projects={cards} />
      ) : (
        <Board projects={cards} />
      )}
    </div>
  );
}
