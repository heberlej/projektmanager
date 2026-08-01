import Link from "next/link";
import { listBoardTasks, taskCountsByStatus } from "@/lib/service";
import { TASK_STATUS_LABEL, TASK_STATUS_ORDER, type TaskStatus } from "@/lib/status";
import { TaskBoard, type BoardTaskData } from "@/components/task-board";
import { AUFGABEN_SPALTEN, TaskTable, type AufgabenSpalte } from "@/components/task-table";
import { leseSortierung } from "@/components/sortable";
import { PRIORITY_ORDER } from "@/lib/status";
import { TaskQuickAdd } from "@/components/task-quick-add";
import { Card, CardBody, EmptyState } from "@/components/ui";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function TasksPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const q = one(params.q).trim();
  // Tabelle ist die Vorgabe; das Board kommt ueber ?ansicht=board dazu.
  const ansicht = one(params.ansicht) === "board" ? "board" : "tabelle";

  const [tasks, counts] = await Promise.all([
    listBoardTasks({ q: q || undefined }),
    taskCountsByStatus(),
  ]);

  const karten: BoardTaskData[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    notes: t.notes,
    plannedStart: t.plannedStart,
    plannedEnd: t.plannedEnd,
    dueDate: t.dueDate,
    recurrence: t.recurrence,
  }));

  const sortierung = leseSortierung<AufgabenSpalte>(params, AUFGABEN_SPALTEN, {
    key: "faellig",
    richtung: "asc",
  });

  // Wie bei den Projekten: sortiert wird hier, damit dieselbe Regel fuer alle
  // Spalten gilt - auch fuer die, die es in der Datenbank so nicht gibt.
  const richtung = sortierung.richtung === "asc" ? 1 : -1;
  const zeit = (wert: Date | string | null) => (wert ? new Date(wert).getTime() : null);
  const sortiert = [...karten].sort((a, b) => {
    switch (sortierung.key) {
      case "titel":
        return a.title.localeCompare(b.title, "de") * richtung;
      case "status":
        return (TASK_STATUS_ORDER.indexOf(a.status) - TASK_STATUS_ORDER.indexOf(b.status)) * richtung;
      case "prioritaet":
        return (PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority)) * richtung;
      case "termin": {
        // Ohne Termin ans Ende, in beide Richtungen - Leeres ist keine Angabe.
        const x = zeit(a.plannedStart);
        const y = zeit(b.plannedStart);
        if (x === null) return y === null ? 0 : 1;
        if (y === null) return -1;
        return (x - y) * richtung;
      }
      case "faellig":
      default: {
        const x = zeit(a.dueDate);
        const y = zeit(b.dueDate);
        if (x === null) return y === null ? 0 : 1;
        if (y === null) return -1;
        return (x - y) * richtung;
      }
    }
  });

  const offen = TASK_STATUS_ORDER.filter((s) => s !== "ERLEDIGT").reduce(
    (n, s) => n + counts[s as TaskStatus],
    0,
  );

  return (
    <div className="mx-auto max-w-[100rem]">
      <header className="glas-kante sticky top-0 z-20 -mx-4 mb-4 px-4 py-3 md:-mx-8 md:px-8">
        <h1 className="text-xl font-semibold text-slate-900">Aufgaben</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          {offen} offen · {counts.ERLEDIGT} erledigt
          {q ? ` · ${karten.length} gefiltert` : ""}
        </p>
      </header>

      <Card className="mb-4">
        <CardBody className="py-3">
          <TaskQuickAdd />
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
                placeholder="Titel oder Notiz"
                className="h-9 w-56 rounded-md border border-slate-300 px-3 text-sm"
              />
            </label>
            <button
              type="submit"
              className="h-9 rounded-md bg-white px-3 text-sm font-medium text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50"
            >
              Filtern
            </button>
            {/* Ansicht und Sortierung haengen am Formular, damit das Filtern
                sie nicht zuruecksetzt. */}
            <input type="hidden" name="ansicht" value={ansicht} />
            <input type="hidden" name="sort" value={sortierung.key} />
            <input type="hidden" name="richtung" value={sortierung.richtung} />
            {q ? (
              <Link
                href={ansicht === "board" ? "/aufgaben?ansicht=board" : "/aufgaben"}
                className="flex h-9 items-center px-2 text-sm text-slate-600 hover:underline"
              >
                zurücksetzen
              </Link>
            ) : null}
          </form>

          <div className="ml-auto flex overflow-hidden rounded-full p-0.5 ring-1 ring-slate-300">
            {(["tabelle", "board"] as const).map((wert) => {
              const ziel = new URLSearchParams();
              if (q) ziel.set("q", q);
              if (wert === "board") ziel.set("ansicht", "board");
              else if (sortierung.key !== "faellig" || sortierung.richtung !== "asc") {
                ziel.set("sort", sortierung.key);
                if (sortierung.richtung === "desc") ziel.set("richtung", "desc");
              }
              const href = ziel.size > 0 ? `/aufgaben?${ziel}` : "/aufgaben";
              return (
                <Link
                  key={wert}
                  href={href}
                  aria-current={ansicht === wert ? "page" : undefined}
                  className={cn(
                    "flex h-8 items-center rounded-full px-3 text-sm transition-colors",
                    ansicht === wert
                      ? "bg-slate-900 text-white"
                      : "text-slate-700 hover:bg-slate-100",
                  )}
                >
                  {wert === "tabelle" ? "Tabelle" : "Board"}
                </Link>
              );
            })}
          </div>
        </CardBody>
      </Card>

      {karten.length === 0 ? (
        <EmptyState
          title="Keine Aufgaben"
          hint={
            q
              ? "Suchbegriff ändern oder zurücksetzen."
              : "Lege oben eine an. Aufgaben, die zu einem Projekt gehören, stehen im Projekt."
          }
        />
      ) : ansicht === "board" ? (
        <TaskBoard tasks={karten} />
      ) : (
        <TaskTable tasks={sortiert} params={params} sortierung={sortierung} />
      )}

      <p className="mt-3 text-xs text-slate-500">
        {ansicht === "board"
          ? `Spalten: ${TASK_STATUS_ORDER.map((s) => TASK_STATUS_LABEL[s]).join(" · ")}. Ziehen setzt den Status. `
          : "Ein Klick auf die Spaltenüberschrift sortiert, ein zweiter dreht die Richtung. "}
        „Erledigt" ist der Status, kein zusätzliches Häkchen. Diese Liste steht für sich – Aufgaben
        aus Projekten erscheinen hier nicht, sie stehen im jeweiligen Projekt. Eine wiederkehrende
        Aufgabe legt ihren Nachfolger an, sobald du sie abhakst.
      </p>
    </div>
  );
}
