import Link from "next/link";
import { dashboardData } from "@/lib/service";
import { STALE_AFTER_DAYS, STATUS_BADGE, STATUS_LABEL, STATUS_ORDER, type Status } from "@/lib/status";
import { Card, CardBody, CardHeader, CardTitle, EmptyState } from "@/components/ui";
import { StatusBadge, TagChip } from "@/components/bits";
import { cn, daysSince, relativeDays } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { byStatus, recent, stale, archivedCount } = await dashboardData();
  const total = STATUS_ORDER.reduce((n, s) => n + byStatus[s], 0);

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
          className="flex h-9 items-center rounded-md bg-blue-600 px-3.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Neues Projekt
        </Link>
      </header>

      <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {STATUS_ORDER.map((status) => (
          <StatusTile key={status} status={status} count={byStatus[status]} />
        ))}
      </section>

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
