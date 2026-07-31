import Link from "next/link";
import {
  dashboardData,
  openTasksForDashboard,
  taskCountsByStatus,
  upcomingEntries,
} from "@/lib/service";
import {
  STALE_AFTER_DAYS,
  STATUS_BADGE,
  STATUS_LABEL,
  STATUS_ORDER,
  TASK_STATUS_BADGE,
  TASK_STATUS_LABEL,
  TASK_STATUS_ORDER,
  type Status,
  type TaskStatus,
} from "@/lib/status";
import { Card, CardBody, CardHeader, CardTitle, EmptyState } from "@/components/ui";
import { StatusBadge, TagChip } from "@/components/bits";
import { entryHref, formatRange, KIND_CHIP, KIND_LABEL } from "@/lib/planning";
import { cn, daysSince, relativeDays } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [{ byStatus, recent, stale, archivedCount }, upcoming, offeneAufgaben, taskCounts] =
    await Promise.all([
      dashboardData(),
      upcomingEntries(6),
      openTasksForDashboard(8),
      taskCountsByStatus(),
    ]);
  const total = STATUS_ORDER.reduce((n, s) => n + byStatus[s], 0);
  const offenGesamt = TASK_STATUS_ORDER.filter((s) => s !== "ERLEDIGT").reduce(
    (n, s) => n + taskCounts[s as TaskStatus],
    0,
  );

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {total} aktive {total === 1 ? "Projekt" : "Projekte"}
            {archivedCount > 0 ? ` · ${archivedCount} im Archiv` : ""}
          </p>
        </div>
        <Link
          href="/projekte/neu"
          className="flex h-9 items-center rounded-md bg-akzent px-3.5 text-sm font-medium text-akzent-auf hover:bg-akzent-stark"
        >
          Neues Projekt
        </Link>
      </header>

      <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {STATUS_ORDER.map((status) => (
          <StatusTile key={status} status={status} count={byStatus[status]} />
        ))}
      </section>

      <Card className="mb-4">
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>
            Offene Aufgaben
            <span className="ml-2 font-normal text-slate-500">{offenGesamt}</span>
          </CardTitle>
          <div className="flex flex-wrap items-center gap-1.5">
            {TASK_STATUS_ORDER.filter((s) => s !== "ERLEDIGT").map((s) => (
              <span
                key={s}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                  TASK_STATUS_BADGE[s],
                )}
              >
                {TASK_STATUS_LABEL[s]} {taskCounts[s as TaskStatus]}
              </span>
            ))}
            <Link href="/aufgaben" className="ml-1 text-xs font-medium text-blue-700 hover:underline">
              Board
            </Link>
          </div>
        </CardHeader>
        <CardBody className="space-y-1.5">
          {offeneAufgaben.length === 0 ? (
            <EmptyState
              title="Nichts offen"
              hint="Neue Aufgaben legst du auf dem Board an. Was zu einem Projekt gehört, steht im Projekt."
            />
          ) : (
            offeneAufgaben.map((task) => (
              <Link
                key={task.id}
                href="/aufgaben"
                className="flex flex-wrap items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50"
              >
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                    TASK_STATUS_BADGE[task.status],
                  )}
                >
                  {TASK_STATUS_LABEL[task.status]}
                </span>
                <span className="text-sm font-medium text-slate-900">{task.title}</span>
                {task.plannedStart && task.plannedEnd ? (
                  <span className="ml-auto shrink-0 text-xs tabular-nums text-slate-600">
                    {formatRange(task.plannedStart, task.plannedEnd)}
                  </span>
                ) : null}
              </Link>
            ))
          )}
        </CardBody>
      </Card>

      <Card className="mb-4">
        <CardHeader className="flex items-center justify-between gap-3">
          <CardTitle>Was als Nächstes ansteht</CardTitle>
          <Link href="/kalender" className="text-xs font-medium text-blue-700 hover:underline">
            Kalender
          </Link>
        </CardHeader>
        <CardBody className="space-y-1.5">
          {upcoming.length === 0 ? (
            <EmptyState
              title="Nichts terminiert"
              hint="Termine setzt du im Projekt – bei den Einstellungen für das ganze Projekt, in der Aufgabenliste für Phase oder Aufgabe."
            />
          ) : (
            upcoming.map((entry) => (
              <Link
                key={`${entry.kind}-${entry.id}`}
                href={entryHref(entry)}
                className="flex flex-wrap items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50"
              >
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                    KIND_CHIP[entry.kind],
                  )}
                >
                  {KIND_LABEL[entry.kind]}
                </span>
                <span className="text-sm font-medium text-slate-900">{entry.title}</span>
                <span className="text-xs text-slate-500">
                  {entry.projectName ?? "ohne Projekt"}
                </span>
                <span className="ml-auto shrink-0 text-xs tabular-nums text-slate-600">
                  {formatRange(entry.start, entry.end)}
                </span>
              </Link>
            ))
          )}
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Zuletzt bewegt</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2">
            {recent.length === 0 ? (
              <EmptyState
                title="Noch keine Projekte"
                hint="Lege das erste Projekt an oder erzeuge eins direkt aus einer Mail im Outlook-Add-in."
              />
            ) : (
              recent.map((project) => (
                <ProjectRow
                  key={project.id}
                  id={project.id}
                  name={project.name}
                  customer={project.customer}
                  status={project.status as Status}
                  tags={project.tags.map((t) => t.tag)}
                  right={relativeDays(project.updatedAt)}
                />
              ))
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Liegengeblieben (&gt; {STALE_AFTER_DAYS} Tage)</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2">
            {stale.length === 0 ? (
              <EmptyState title="Nichts liegengeblieben" hint="Alle Projekte hatten zuletzt Bewegung." />
            ) : (
              stale.map((project) => (
                <ProjectRow
                  key={project.id}
                  id={project.id}
                  name={project.name}
                  customer={project.customer}
                  status={project.status as Status}
                  tags={project.tags.map((t) => t.tag)}
                  right={`${daysSince(project.updatedAt)} Tage`}
                  warn
                />
              ))
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function StatusTile({ status, count }: { status: Status; count: number }) {
  return (
    <Link
      href={`/projekte?status=${status}`}
      className={cn(
        "rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md",
        count === 0 && "opacity-60",
      )}
    >
      <div className="text-2xl font-semibold tabular-nums text-slate-900">{count}</div>
      <div className={cn("mt-1.5 inline-block rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", STATUS_BADGE[status])}>
        {STATUS_LABEL[status]}
      </div>
    </Link>
  );
}

function ProjectRow({
  id,
  name,
  customer,
  status,
  tags,
  right,
  warn,
}: {
  id: string;
  name: string;
  customer: string;
  status: Status;
  tags: { id: string; name: string; color: string }[];
  right: string;
  warn?: boolean;
}) {
  return (
    <Link
      href={`/projekte/${id}`}
      className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-slate-50"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-slate-900">{name}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1">
          <span className="text-xs text-slate-500">{customer}</span>
          <StatusBadge status={status} />
          {tags.map((tag) => (
            <TagChip key={tag.id} name={tag.name} color={tag.color} />
          ))}
        </div>
      </div>
      <span className={cn("shrink-0 text-xs tabular-nums", warn ? "text-rose-600" : "text-slate-500")}>
        {right}
      </span>
    </Link>
  );
}
