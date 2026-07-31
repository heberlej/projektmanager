"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteTaskAction, moveTaskAction } from "@/lib/actions";
import { ScheduleForm } from "./schedule-form";
import {
  TASK_STATUS_DOT,
  TASK_STATUS_LABEL,
  TASK_STATUS_ORDER,
  type TaskStatus,
} from "@/lib/status";
import { formatRange } from "@/lib/planning";
import { cn } from "@/lib/utils";

export type BoardTaskData = {
  id: string;
  title: string;
  status: TaskStatus;
  notes: string | null;
  plannedStart: Date | string | null;
  plannedEnd: Date | string | null;
};

/**
 * Board der freien Aufgaben. Gleiches Muster wie das Projektboard: natives
 * HTML5-Drag-and-Drop, optimistische Anzeige, Wechsel serverseitig.
 *
 * Projektaufgaben kommen hier nicht vor - die stehen in ihrem Projekt.
 */
export function TaskBoard({ tasks }: { tasks: BoardTaskData[] }) {
  const router = useRouter();
  const [items, setItems] = useState(tasks);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<TaskStatus | null>(null);
  const [, startTransition] = useTransition();

  // Props gewinnen, sobald der Server neu gerendert hat.
  const [seed, setSeed] = useState(tasks);
  if (seed !== tasks) {
    setSeed(tasks);
    setItems(tasks);
  }

  function handleDrop(status: TaskStatus) {
    setOverStatus(null);
    const id = dragId;
    setDragId(null);
    if (!id) return;

    const current = items.find((t) => t.id === id);
    if (!current || current.status === status) return;

    setItems((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
    startTransition(async () => {
      await moveTaskAction(id, status);
      router.refresh();
    });
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {TASK_STATUS_ORDER.map((status) => {
        const column = items.filter((t) => t.status === status);
        return (
          <section
            key={status}
            onDragOver={(event) => {
              event.preventDefault();
              setOverStatus(status);
            }}
            onDragLeave={() => setOverStatus((s) => (s === status ? null : s))}
            onDrop={() => handleDrop(status)}
            className={cn(
              "flex w-72 shrink-0 flex-col rounded-lg bg-slate-100/80 p-2",
              overStatus === status && "drop-target",
            )}
          >
            <header className="mb-2 flex items-center gap-2 px-1">
              <span className={cn("h-2 w-2 rounded-full", TASK_STATUS_DOT[status])} aria-hidden />
              <h2 className="text-xs font-semibold tracking-wide text-slate-700 uppercase">
                {TASK_STATUS_LABEL[status]}
              </h2>
              <span className="ml-auto text-xs tabular-nums text-slate-500">{column.length}</span>
            </header>

            <div className="flex flex-col gap-2">
              {column.map((task) => (
                <div
                  key={task.id}
                  draggable
                  onDragStart={() => setDragId(task.id)}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverStatus(null);
                  }}
                  className={cn(
                    "cursor-grab active:cursor-grabbing",
                    dragId === task.id && "dragging",
                  )}
                >
                  <TaskCard task={task} />
                </div>
              ))}
              {column.length === 0 ? (
                <p className="px-1 py-6 text-center text-xs text-slate-400">leer</p>
              ) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function TaskCard({ task }: { task: BoardTaskData }) {
  return (
    <article className="rounded-md border border-slate-200 bg-white p-2.5 shadow-sm">
      <p className="text-sm font-medium text-slate-900">{task.title}</p>

      {task.notes ? (
        <p className="mt-1 line-clamp-2 text-xs text-slate-500">{task.notes}</p>
      ) : null}

      {task.plannedStart && task.plannedEnd ? (
        <p className="mt-1.5 text-xs tabular-nums text-slate-600">
          {formatRange(task.plannedStart, task.plannedEnd)}
        </p>
      ) : null}

      {/* draggable=false, sonst startet jeder Klick ins Eingabefeld einen Zug.
          Ohne diesen Block kaeme eine freie Aufgabe nie an einen Termin. */}
      <div
        draggable={false}
        onDragStart={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        className="mt-1.5"
      >
        <details>
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs text-slate-500 hover:text-slate-800">
            <span aria-hidden>🕒</span>
            {task.plannedStart ? "Termin ändern" : "Termin setzen"}
          </summary>
          <div className="mt-1.5 rounded-md bg-slate-50 p-2">
            <ScheduleForm
              kind="AUFGABE"
              id={task.id}
              projectId={null}
              start={task.plannedStart}
              end={task.plannedEnd}
              variant="inline"
            />
            <form action={deleteTaskAction} className="mt-2">
              <input type="hidden" name="taskId" value={task.id} />
              <input type="hidden" name="projectId" value="" />
              <button
                type="submit"
                className="text-xs text-rose-700 hover:underline"
              >
                Aufgabe löschen
              </button>
            </form>
          </div>
        </details>
      </div>
    </article>
  );
}
