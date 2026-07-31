import Link from "next/link";
import { listBoardTasks, listProjects, taskCountsByStatus } from "@/lib/service";
import { TASK_STATUS_LABEL, TASK_STATUS_ORDER, type TaskStatus } from "@/lib/status";
import { TaskBoard, type BoardTaskData } from "@/components/task-board";
import { TaskQuickAdd } from "@/components/task-quick-add";
import { Card, CardBody, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function TasksPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const q = one(params.q).trim();
  const projekt = one(params.projekt);
  const ohneProjekt = one(params.frei) === "1";

  const [tasks, projects, counts] = await Promise.all([
    listBoardTasks({
      q: q || undefined,
      projectId: projekt || undefined,
      ohneProjekt: ohneProjekt || undefined,
    }),
    listProjects(),
    taskCountsByStatus(),
  ]);

  const karten: BoardTaskData[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    notes: t.notes,
    plannedStart: t.plannedStart,
    plannedEnd: t.plannedEnd,
    projectId: t.projectId,
    projectName: t.projectName,
    customer: t.customer,
    phaseTitle: t.phaseTitle,
  }));

  const offen = TASK_STATUS_ORDER.filter((s) => s !== "ERLEDIGT").reduce(
    (n, s) => n + counts[s as TaskStatus],
    0,
  );

  return (
    <div className="mx-auto max-w-[100rem]">
      <header className="mb-4">
        <h1 className="text-xl font-semibold text-slate-900">Aufgaben</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          {offen} offen · {counts.ERLEDIGT} erledigt
          {q || projekt || ohneProjekt ? ` · ${karten.length} gefiltert` : ""}
        </p>
      </header>

      <Card className="mb-4">
        <CardBody className="py-3">
          <TaskQuickAdd projects={projects.map((p) => ({ id: p.id, name: p.name }))} />
        </CardBody>
      </Card>

      <Card className="mb-4">
        <CardBody className="flex flex-wrap items-end gap-2 py-3">
          <form className="flex flex-wrap items-end gap-2">
            <label>
              <span className="mb-1 block text-xs font-medium text-slate-600">Suche</span>
              <input
                name="q"
                defaultValue={q}
                placeholder="Titel, Notiz, Projekt, Kunde"
                className="h-9 w-56 rounded-md border border-slate-300 px-3 text-sm"
              />
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium text-slate-600">Projekt</span>
              <select
                name="projekt"
                defaultValue={projekt}
                className="h-9 rounded-md border border-slate-300 px-2 text-sm"
              >
                <option value="">alle</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex h-9 items-center gap-1.5 text-sm text-slate-700">
              <input type="checkbox" name="frei" value="1" defaultChecked={ohneProjekt} />
              nur ohne Projekt
            </label>
            <button
              type="submit"
              className="h-9 rounded-md bg-white px-3 text-sm font-medium text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50"
            >
              Filtern
            </button>
            {q || projekt || ohneProjekt ? (
              <Link
                href="/aufgaben"
                className="flex h-9 items-center px-2 text-sm text-slate-600 hover:underline"
              >
                zurücksetzen
              </Link>
            ) : null}
          </form>
        </CardBody>
      </Card>

      {karten.length === 0 ? (
        <EmptyState
          title="Keine Aufgaben"
          hint={
            q || projekt || ohneProjekt
              ? "Filter zurücksetzen oder Suchbegriff ändern."
              : "Lege oben eine an – ein Projekt ist dafür nicht nötig."
          }
        />
      ) : (
        <TaskBoard tasks={karten} />
      )}

      <p className="mt-3 text-xs text-slate-500">
        Spalten: {TASK_STATUS_ORDER.map((s) => TASK_STATUS_LABEL[s]).join(" · ")}. Ziehen setzt den
        Status; „Erledigt" ist der Status, kein zusätzliches Häkchen.
      </p>
    </div>
  );
}
