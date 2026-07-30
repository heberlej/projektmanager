"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { moveProjectAction } from "@/lib/actions";
import { STATUS_DOT, STATUS_LABEL, STATUS_ORDER, type Status } from "@/lib/status";
import { ProjectCard, type ProjectCardData } from "./project-card";
import { cn } from "@/lib/utils";

/**
 * Board mit nativem HTML5-Drag-and-Drop - kein zusaetzliches DnD-Paket.
 * Der Statuswechsel wird optimistisch angezeigt und serverseitig protokolliert.
 */
export function Board({ projects }: { projects: ProjectCardData[] }) {
  const router = useRouter();
  const [items, setItems] = useState(projects);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<Status | null>(null);
  const [, startTransition] = useTransition();

  // Props gewinnen, sobald der Server neu gerendert hat.
  const [seed, setSeed] = useState(projects);
  if (seed !== projects) {
    setSeed(projects);
    setItems(projects);
  }

  function handleDrop(status: Status) {
    setOverStatus(null);
    const id = dragId;
    setDragId(null);
    if (!id) return;

    const current = items.find((p) => p.id === id);
    if (!current || current.status === status) return;

    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
    startTransition(async () => {
      await moveProjectAction(id, status);
      router.refresh();
    });
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {STATUS_ORDER.map((status) => {
        const column = items.filter((p) => p.status === status);
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
              <span className={cn("h-2 w-2 rounded-full", STATUS_DOT[status])} aria-hidden />
              <h2 className="text-xs font-semibold tracking-wide text-slate-700 uppercase">
                {STATUS_LABEL[status]}
              </h2>
              <span className="ml-auto text-xs tabular-nums text-slate-500">
                {column.length}
              </span>
            </header>

            <div className="flex flex-col gap-2">
              {column.map((project) => (
                <div
                  key={project.id}
                  draggable
                  onDragStart={() => setDragId(project.id)}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverStatus(null);
                  }}
                  className={cn("cursor-grab active:cursor-grabbing", dragId === project.id && "dragging")}
                >
                  <ProjectCard project={project} />
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
