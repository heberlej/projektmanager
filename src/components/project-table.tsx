import Link from "next/link";
import { PriorityBadge, StatusBadge, TagChip } from "./bits";
import type { ProjectCardData } from "./project-card";
import { cn, formatDate, relativeDays } from "@/lib/utils";
import { KOPFZEILE, SortHeader, TabellenRahmen, ZEILE, type Sortierung } from "./sortable";

export const PROJEKT_SPALTEN = ["name", "kunde", "status", "fortschritt", "zuletzt"] as const;
export type ProjektSpalte = (typeof PROJEKT_SPALTEN)[number];

/** Anteil als Zahl, darunter der Balken - eine Groesse, eine Farbe. */
function Fortschritt({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="min-w-28">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium tabular-nums text-slate-700">
          {total === 0 ? "–" : `${pct} %`}
        </span>
        {total > 0 ? (
          <span className="text-xs tabular-nums text-slate-500">
            {done}/{total}
          </span>
        ) : null}
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div
          className={cn("h-full rounded-full", pct === 100 ? "bg-erledigt" : "bg-akzent")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Anhaenge({ counts }: { counts: ProjectCardData["counts"] }) {
  const teile = [
    counts.mailLinks > 0 ? { icon: "✉", n: counts.mailLinks, title: "angeheftete Mails" } : null,
    counts.attachments > 0 ? { icon: "📎", n: counts.attachments, title: "Dateien" } : null,
    counts.notes > 0 ? { icon: "📝", n: counts.notes, title: "Notizen" } : null,
  ].filter(Boolean) as { icon: string; n: number; title: string }[];

  if (teile.length === 0) return null;
  return (
    <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
      {teile.map((t) => (
        <span key={t.title} title={t.title}>
          <span aria-hidden>{t.icon}</span> {t.n}
        </span>
      ))}
    </div>
  );
}

export function ProjectTable({
  projects,
  params,
  sortierung,
}: {
  projects: ProjectCardData[];
  params: Record<string, string | string[] | undefined>;
  sortierung: Sortierung<ProjektSpalte>;
}) {
  return (
    <>
      {/* Ab md die Tabelle. Darunter waere sie nur eine Einladung zum
          Querscrollen - dort stehen Karten mit denselben Angaben. */}
      <div className="hidden md:block">
        <TabellenRahmen>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className={KOPFZEILE}>
                <SortHeader pfad="/projekte" params={params} aktiv={sortierung} spalte="name">
                  Projekt
                </SortHeader>
                <SortHeader pfad="/projekte" params={params} aktiv={sortierung} spalte="kunde">
                  Kunde
                </SortHeader>
                <SortHeader pfad="/projekte" params={params} aktiv={sortierung} spalte="status">
                  Status
                </SortHeader>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  Projektart
                </th>
                <SortHeader
                  pfad="/projekte"
                  params={params}
                  aktiv={sortierung}
                  spalte="fortschritt"
                  className="w-44"
                >
                  Fortschritt
                </SortHeader>
                <SortHeader
                  pfad="/projekte"
                  params={params}
                  aktiv={sortierung}
                  spalte="zuletzt"
                  className="w-28"
                >
                  Zuletzt
                </SortHeader>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id} className={ZEILE}>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/projekte/${project.id}`}
                        className="font-medium text-slate-900 hover:underline focus-visible:underline"
                      >
                        {project.name}
                      </Link>
                      <PriorityBadge priority={project.priority} />
                    </div>
                    <Anhaenge counts={project.counts} />
                  </td>
                  <td className="px-3 py-3 text-slate-600">{project.customer}</td>
                  <td className="px-3 py-3">
                    <StatusBadge status={project.status} />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {project.tags.map((tag) => (
                        <TagChip key={tag.id} name={tag.name} color={tag.color} />
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <Fortschritt done={project.progress.done} total={project.progress.total} />
                  </td>
                  <td
                    className="px-3 py-3 text-xs tabular-nums text-slate-500"
                    title={formatDate(project.updatedAt)}
                  >
                    {relativeDays(project.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TabellenRahmen>
      </div>

      <div className="grid gap-2 md:hidden">
        {projects.map((project) => (
          <Link
            key={project.id}
            href={`/projekte/${project.id}`}
            className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-colors hover:bg-slate-50"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium text-slate-900">{project.name}</span>
              <span className="shrink-0 text-xs tabular-nums text-slate-500">
                {relativeDays(project.updatedAt)}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-500">{project.customer}</span>
              <StatusBadge status={project.status} />
              <PriorityBadge priority={project.priority} />
            </div>
            <div className="mt-2">
              <Fortschritt done={project.progress.done} total={project.progress.total} />
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
