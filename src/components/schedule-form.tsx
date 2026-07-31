"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { setScheduleAction, type ActionState } from "@/lib/actions";
import { Button, Input } from "./ui";
import {
  formatDuration,
  formatRange,
  toLocalInputValue,
  type PlannedKind,
} from "@/lib/planning";

/**
 * Termin von-bis fuer Projekt, Phase oder Aufgabe. Beide Felder leeren und
 * speichern entfernt den Termin wieder.
 *
 * Zwei Darstellungen: "block" fuer die Projekteinstellungen, "inline" fuer die
 * gedraengte Aufgabenliste.
 */
export function ScheduleForm({
  kind,
  id,
  projectId,
  start,
  end,
  variant = "block",
}: {
  kind: PlannedKind;
  id: string;
  /** Null bei Aufgaben ohne Projekt. */
  projectId: string | null;
  start: Date | string | null;
  end: Date | string | null;
  variant?: "block" | "inline";
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(setScheduleAction, {});
  const gesetzt = Boolean(start && end);

  return (
    <form action={formAction} className={variant === "inline" ? "space-y-1" : "space-y-2"}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="projectId" value={projectId ?? ""} />

      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-40 flex-1">
          <span className="mb-1 block text-xs font-medium text-slate-600">Beginn</span>
          <Input
            type="datetime-local"
            name="start"
            defaultValue={toLocalInputValue(start)}
            className={variant === "inline" ? "h-8" : undefined}
          />
        </label>
        <label className="min-w-40 flex-1">
          <span className="mb-1 block text-xs font-medium text-slate-600">Ende</span>
          <Input
            type="datetime-local"
            name="end"
            defaultValue={toLocalInputValue(end)}
            className={variant === "inline" ? "h-8" : undefined}
          />
        </label>
        <SubmitButton compact={variant === "inline"} gesetzt={gesetzt} />
      </div>

      {state.error ? (
        <p className="text-xs font-medium text-rose-700">{state.error}</p>
      ) : gesetzt ? (
        <p className="text-xs text-slate-500">
          {formatRange(start!, end!)}
          {formatDuration(start!, end!) ? ` · ${formatDuration(start!, end!)}` : ""}
        </p>
      ) : (
        <p className="text-xs text-slate-500">
          Kein Termin gesetzt. Beide Felder füllen, um ihn in den Kalender zu legen.
        </p>
      )}
    </form>
  );
}

function SubmitButton({ compact, gesetzt }: { compact: boolean; gesetzt: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="secondary"
      size={compact ? "sm" : "md"}
      disabled={pending}
      className={compact ? "h-8" : undefined}
    >
      {pending ? "…" : gesetzt ? "Ändern" : "Speichern"}
    </Button>
  );
}
