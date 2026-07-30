import Link from "next/link";
import { CountHint, PriorityBadge, ProgressBar, StatusBadge, TagChip } from "./bits";
import { relativeDays } from "@/lib/utils";
import type { Priority, Status } from "@/lib/status";

/**
 * Reines Anzeige-Modell - bewusst ohne Prisma-Typen, damit die Karte auch in
 * Client-Komponenten (Board) verwendet werden kann.
 */
export type ProjectCardData = {
  id: string;
  name: string;
  customer: string;
  status: Status;
  priority: Priority;
  updatedAt: string | Date;
  tags: { id: string; name: string; color: string }[];
  progress: { done: number; total: number };
  counts: { attachments: number; mailLinks: number; notes: number };
};

export function ProjectCard({
  project,
  showStatus = false,
}: {
  project: ProjectCardData;
  showStatus?: boolean;
}) {
  const open = project.progress.total - project.progress.done;

  return (
    <Link
      href={`/projekte/${project.id}`}
      className="block rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold text-slate-900">{project.name}</span>
        <PriorityBadge priority={project.priority} />
      </div>

      <p className="mt-0.5 text-xs text-slate-500">{project.customer}</p>

      {(showStatus || project.tags.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {showStatus ? <StatusBadge status={project.status} /> : null}
          {project.tags.map((tag) => (
            <TagChip key={tag.id} name={tag.name} color={tag.color} />
          ))}
        </div>
      )}

      <ProgressBar
        className="mt-3"
        done={project.progress.done}
        total={project.progress.total}
      />

      <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
        <span>{open > 0 ? `${open} offen` : "nichts offen"}</span>
        <span className="text-slate-300">·</span>
        <span>{relativeDays(project.updatedAt)}</span>
        <span className="ml-auto flex items-center gap-2">
          <CountHint icon="✉" count={project.counts.mailLinks} title="angeheftete Mails" />
          <CountHint icon="📎" count={project.counts.attachments} title="Dateien" />
          <CountHint icon="✎" count={project.counts.notes} title="Notizen" />
        </span>
      </div>
    </Link>
  );
}
