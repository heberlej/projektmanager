"use client";

import { useState } from "react";
import { bulkTaskAction, deleteTaskAction, setTaskDetailsAction, setTaskStatusAction } from "@/lib/actions";
import { AutoForm, SammelLeiste } from "./zeilen-bedienung";
import {
  PRIORITY_BADGE,
  PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  TASK_STATUS_ORDER,
} from "@/lib/status";
import { RECURRENCE_LABEL } from "@/lib/recurrence";
import { formatRange } from "@/lib/planning";
import { ConfirmButton } from "./confirm-button";
import { ScheduleForm } from "./schedule-form";
import { Select } from "./ui";
import { cn } from "@/lib/utils";
import { KOPFZEILE, SortHeader, TabellenRahmen, ZEILE, type Sortierung } from "./sortable";
import type { BoardTaskData } from "./task-board";

import type { AufgabenSpalte } from "@/lib/tabellen";

/** Datum als Wert fuer <input type="date">. */
function alsTagesWert(wert: Date | string | null): string {
  if (!wert) return "";
  const d = new Date(wert);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Tagesgenau: heute faellig ist nicht ueberfaellig. */
function faelligkeit(dueDate: Date | string | null) {
  if (!dueDate) return null;
  const faellig = new Date(dueDate);
  const heute = new Date();
  const tage = Math.round(
    (new Date(faellig.getFullYear(), faellig.getMonth(), faellig.getDate()).getTime() -
      new Date(heute.getFullYear(), heute.getMonth(), heute.getDate()).getTime()) /
      86_400_000,
  );
  return {
    text: faellig.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" }),
    ueberfaellig: tage < 0,
    heute: tage === 0,
  };
}

/**
 * Aufgaben als Tabelle. Anders als das Board zeigt sie alle Angaben
 * nebeneinander statt in Spalten nach Status - dafuer laesst sich der Status
 * hier nicht ziehen, sondern nur auswaehlen.
 */
export function TaskTable({
  tasks,
  params,
  sortierung,
}: {
  tasks: BoardTaskData[];
  params: Record<string, string | string[] | undefined>;
  sortierung: Sortierung<AufgabenSpalte>;
}) {
  const [gewaehlt, setGewaehlt] = useState<string[]>([]);
  const ids = tasks.map((t) => t.id);
  const alleGewaehlt = ids.length > 0 && gewaehlt.length === ids.length;

  const kaestchen = (id: string) => (
    <input
      type="checkbox"
      checked={gewaehlt.includes(id)}
      onChange={() =>
        setGewaehlt((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]))
      }
      aria-label="Zeile auswählen"
      className="h-4 w-4 accent-akzent"
    />
  );

  const kopfKaestchen = (
    <input
      type="checkbox"
      checked={alleGewaehlt}
      onChange={() => setGewaehlt(alleGewaehlt ? [] : ids)}
      aria-label="Alle auswählen"
      className="h-4 w-4 accent-akzent"
    />
  );

  return (
    <>
    <TabellenRahmen>
      <table className="w-full min-w-[52rem] border-collapse text-sm">
        <thead>
          <tr className={KOPFZEILE}>
            <th scope="col" className="w-10 px-3 py-2.5">
              {kopfKaestchen}
            </th>
            <SortHeader pfad="/aufgaben" params={params} aktiv={sortierung} spalte="titel">
              Aufgabe
            </SortHeader>
            <SortHeader
              pfad="/aufgaben"
              params={params}
              aktiv={sortierung}
              spalte="status"
              className="w-36"
            >
              Status
            </SortHeader>
            <SortHeader
              pfad="/aufgaben"
              params={params}
              aktiv={sortierung}
              spalte="prioritaet"
              className="w-24"
            >
              Priorität
            </SortHeader>
            <SortHeader
              pfad="/aufgaben"
              params={params}
              aktiv={sortierung}
              spalte="faellig"
              className="w-28"
            >
              Fällig
            </SortHeader>
            <SortHeader
              pfad="/aufgaben"
              params={params}
              aktiv={sortierung}
              spalte="termin"
              className="w-56"
            >
              Termin
            </SortHeader>
            <th scope="col" className="w-10 px-3 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const faellig = faelligkeit(task.dueDate);
            return (
              <tr key={task.id} className={ZEILE}>
                <td className="px-3 py-2 align-top">{kaestchen(task.id)}</td>
                <td className="px-3 py-2">
                  <p className="font-medium text-slate-900">{task.title}</p>
                  {task.notes ? (
                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{task.notes}</p>
                  ) : null}
                  {task.recurrence ? (
                    <p className="mt-0.5 text-xs text-slate-500">
                      <span aria-hidden>↻ </span>
                      {RECURRENCE_LABEL[task.recurrence]}
                    </p>
                  ) : null}
                </td>

                <td className="px-3 py-2">
                  <AutoForm action={setTaskStatusAction}>
                    <input type="hidden" name="taskId" value={task.id} />
                    <Select
                      name="status"
                      defaultValue={task.status}
                      className="h-8 w-auto py-0 text-xs"
                      aria-label={`Status von ${task.title}`}
                    >
                      {TASK_STATUS_ORDER.map((s) => (
                        <option key={s} value={s}>
                          {TASK_STATUS_LABEL[s]}
                        </option>
                      ))}
                    </Select>
                    {/* Ohne Skript im Browser bleibt der Knopf sichtbar - mit
                        Skript blendet ihn .auto-abschicken aus. */}
                    <button
                      type="submit"
                      className="nur-ohne-skript mt-1 text-xs text-slate-500 hover:text-slate-900 hover:underline"
                    >
                      übernehmen
                    </button>
                  </AutoForm>
                </td>

                <td className="px-3 py-2">
                  {task.priority === "NORMAL" ? (
                    /* aria-hidden: eine leere Zelle ist die richtige Aussage,
                       der Strich ist nur fuers Auge. */
                    <span aria-hidden className="text-xs text-slate-500">
                      –
                    </span>
                  ) : (
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                        PRIORITY_BADGE[task.priority],
                      )}
                    >
                      {PRIORITY_LABEL[task.priority]}
                    </span>
                  )}
                </td>

                <td className="px-3 py-2">
                  {/* Direkt in der Zelle setzen - der Umweg ueber die
                      Bearbeitungsmaske war der laestigste Klick der Liste. */}
                  <AutoForm action={setTaskDetailsAction} className="flex flex-col gap-1">
                    <input type="hidden" name="taskId" value={task.id} />
                    <input type="hidden" name="priority" value={task.priority} />
                    <input
                      type="date"
                      name="dueDate"
                      defaultValue={alsTagesWert(task.dueDate)}
                      aria-label={`Fälligkeit von ${task.title}`}
                      className={cn(
                        "h-7 w-auto rounded-lg border border-slate-300 bg-white px-1.5 text-xs tabular-nums",
                        faellig?.ueberfaellig && "border-rose-300 font-medium text-rose-700",
                        faellig?.heute && "font-medium text-amber-900",
                      )}
                    />
                    <button
                      type="submit"
                      className="nur-ohne-skript text-xs text-slate-500 hover:underline"
                    >
                      übernehmen
                    </button>
                  </AutoForm>
                </td>

                <td className="px-3 py-2">
                  {task.plannedStart && task.plannedEnd ? (
                    <p className="mb-1 text-xs tabular-nums text-slate-600">
                      {formatRange(task.plannedStart, task.plannedEnd)}
                    </p>
                  ) : null}
                  <details>
                    <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs text-slate-500 hover:text-slate-800">
                      <span aria-hidden>🕒</span>
                      {task.plannedStart ? "ändern" : "setzen"}
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
                    </div>
                  </details>
                </td>

                <td className="px-3 py-2 text-right">
                  <form action={deleteTaskAction}>
                    <input type="hidden" name="taskId" value={task.id} />
                    <input type="hidden" name="projectId" value="" />
                    <ConfirmButton message={`Aufgabe „${task.title}" löschen?`}>Löschen</ConfirmButton>
                  </form>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TabellenRahmen>

      <SammelLeiste
        gewaehlt={gewaehlt}
        action={bulkTaskAction}
        aufAbbrechen={() => setGewaehlt([])}
        aktionen={[
          { wert: "ERLEDIGT", beschriftung: "Erledigt" },
          { wert: "IN_ARBEIT", beschriftung: "In Arbeit" },
          { wert: "loeschen", beschriftung: "In den Papierkorb", gefaehrlich: true },
        ]}
      />
    </>
  );
}
