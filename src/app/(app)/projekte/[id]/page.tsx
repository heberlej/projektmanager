import Link from "next/link";
import { notFound } from "next/navigation";
import { getProject, listCustomers, listTags, listTemplates } from "@/lib/service";
import { StatusSelect } from "@/components/status-select";
import { TagChip } from "@/components/bits";
import { TasksTab } from "@/components/project/tasks-tab";
import { NotesTab } from "@/components/project/notes-tab";
import { FilesTab } from "@/components/project/files-tab";
import { MailsTab } from "@/components/project/mails-tab";
import { SettingsTab } from "@/components/project/settings-tab";
import { cn, relativeDays } from "@/lib/utils";
import type { Status } from "@/lib/status";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "aufgaben", label: "Aufgaben" },
  { key: "notizen", label: "Notizen" },
  { key: "dateien", label: "Dateien" },
  { key: "mails", label: "Mails" },
  { key: "einstellungen", label: "Einstellungen" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;

  const project = await getProject(id);
  if (!project) notFound();

  const raw = Array.isArray(query.tab) ? query.tab[0] : query.tab;
  const tab: TabKey = TABS.some((t) => t.key === raw) ? (raw as TabKey) : "aufgaben";

  const [customers, tags, templates] = await Promise.all([
    listCustomers(),
    listTags(),
    listTemplates(),
  ]);

  const counts: Record<TabKey, number | null> = {
    aufgaben: project.progress.total,
    notizen: project.notes.length,
    dateien: project.attachments.length,
    mails: project.mailLinks.length,
    einstellungen: null,
  };

  return (
    <div className="mx-auto max-w-4xl">
      <nav className="mb-3 text-sm text-slate-500">
        <Link href="/projekte" className="hover:underline">
          Projekte
        </Link>
        <span className="px-1.5">/</span>
        <span className="truncate text-slate-700">{project.name}</span>
      </nav>

      <header className="mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-slate-900">{project.name}</h1>
          <StatusSelect projectId={project.id} status={project.status as Status} />
          {project.archived ? (
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
              archiviert
            </span>
          ) : null}
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-600">{project.customer}</span>
          {project.tags.map(({ tag }) => (
            <TagChip key={tag.id} name={tag.name} color={tag.color} />
          ))}
          <span className="text-xs text-slate-400">
            zuletzt geändert {relativeDays(project.updatedAt)}
          </span>
        </div>

        {project.description ? (
          <p className="mt-3 max-w-3xl text-sm whitespace-pre-line text-slate-600">
            {project.description}
          </p>
        ) : null}
      </header>

      <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((entry) => (
          <Link
            key={entry.key}
            href={`/projekte/${project.id}?tab=${entry.key}`}
            scroll={false}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === entry.key
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            {entry.label}
            {counts[entry.key] ? (
              <span className="ml-1.5 text-xs tabular-nums text-slate-400">
                {counts[entry.key]}
              </span>
            ) : null}
          </Link>
        ))}
      </div>

      {tab === "aufgaben" ? (
        <TasksTab project={project} templates={templates.map((t) => ({ id: t.id, name: t.name }))} />
      ) : null}
      {tab === "notizen" ? <NotesTab project={project} /> : null}
      {tab === "dateien" ? <FilesTab project={project} /> : null}
      {tab === "mails" ? <MailsTab project={project} /> : null}
      {tab === "einstellungen" ? (
        <SettingsTab project={project} customers={customers} tags={tags} />
      ) : null}
    </div>
  );
}
