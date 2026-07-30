import { NextResponse } from "next/server";
import { listProjects, listTags, listTemplates } from "@/lib/service";

/**
 * Suchliste fuer die Projektzuordnung im Add-in. Liefert zusaetzlich Tags und
 * Vorlagen, damit das Taskpane mit einem Aufruf startklar ist.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const withMeta = url.searchParams.get("meta") === "1";

  const projects = await listProjects({ q: q || undefined, archived: false });

  const payload: Record<string, unknown> = {
    projects: projects.slice(0, 50).map((project) => ({
      id: project.id,
      name: project.name,
      customer: project.customer,
      status: project.status,
      tags: project.tags.map((t) => t.tag.name),
      openTasks: project.progress.total - project.progress.done,
    })),
  };

  if (withMeta) {
    const [tags, templates] = await Promise.all([listTags(), listTemplates()]);
    payload.tags = tags.map((t) => ({ id: t.id, name: t.name, color: t.color }));
    payload.templates = templates.map((t) => ({ id: t.id, name: t.name }));
    payload.customers = [...new Set(projects.map((p) => p.customer))].sort();
  }

  return NextResponse.json(payload);
}
