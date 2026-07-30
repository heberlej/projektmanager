import Link from "next/link";
import { PriorityBadge, ProgressBar, StatusBadge, TagChip } from "./bits";
import type { ProjectCardData } from "./project-card";
import { formatDate, relativeDays } from "@/lib/utils";

export function ProjectTable({ projects }: { projects: ProjectCardData[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[54rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500 uppercase">
            <th className="px-3 py-2 font-medium">Projekt</th>
            <th className="px-3 py-2 font-medium">Kunde</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Projektart</th>
            <th className="w-48 px-3 py-2 font-medium">Fortschritt</th>
            <th className="px-3 py-2 font-medium">Zuletzt</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => (
            <tr key={project.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
              <td className="px-3 py-2">
                <Link
                  href={`/projekte/${project.id}`}
                  className="font-medium text-slate-900 hover:underline"
                >
                  {project.name}
                </Link>
                <PriorityBadge priority={project.priority} />
              </td>
              <td className="px-3 py-2 text-slate-600">{project.customer}</td>
              <td className="px-3 py-2">
                <StatusBadge status={project.status} />
              </td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-1">
                  {project.tags.map((tag) => (
                    <TagChip key={tag.id} name={tag.name} color={tag.color} />
                  ))}
                </div>
              </td>
              <td className="px-3 py-2">
                <ProgressBar done={project.progress.done} total={project.progress.total} />
              </td>
              <td className="px-3 py-2 text-slate-500" title={formatDate(project.updatedAt)}>
                {relativeDays(project.updatedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
