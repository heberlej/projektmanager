"use client";

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";
import { addLooseTaskAction, type ActionState } from "@/lib/actions";
import { Button, Input, Select } from "./ui";
import { PRIORITY_LABEL, PRIORITY_ORDER, TASK_STATUS_LABEL, TASK_STATUS_ORDER } from "@/lib/status";
import { RECURRENCES, RECURRENCE_LABEL } from "@/lib/recurrence";

/**
 * Aufgabe direkt vom Board aus anlegen. Immer ohne Projekt: die Aufgabenliste
 * ist von den Projekten getrennt, Projektaufgaben entstehen im Projekt.
 */
export function TaskQuickAdd() {
  const [state, formAction] = useActionState<ActionState, FormData>(addLooseTaskAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await formAction(formData);
        formRef.current?.reset();
      }}
      className="flex flex-wrap items-end gap-2"
    >
      <label className="min-w-56 flex-1">
        <span className="mb-1 block text-xs font-medium text-slate-600">Neue Aufgabe</span>
        <Input name="title" required maxLength={300} placeholder="Was ist zu tun?" />
      </label>

      <label>
        <span className="mb-1 block text-xs font-medium text-slate-600">Status</span>
        <Select name="status" defaultValue="OFFEN" className="w-auto">
          {TASK_STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {TASK_STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
      </label>

      <label>
        <span className="mb-1 block text-xs font-medium text-slate-600">Priorität</span>
        <Select name="priority" defaultValue="NORMAL" className="w-auto">
          {PRIORITY_ORDER.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </Select>
      </label>

      <label>
        <span className="mb-1 block text-xs font-medium text-slate-600">Fällig</span>
        <Input type="date" name="dueDate" className="w-auto" />
      </label>

      <label>
        <span className="mb-1 block text-xs font-medium text-slate-600">Wiederholung</span>
        <Select name="recurrence" defaultValue="" className="w-auto">
          <option value="">einmalig</option>
          {RECURRENCES.map((r) => (
            <option key={r} value={r}>
              {RECURRENCE_LABEL[r]}
            </option>
          ))}
        </Select>
      </label>

      <SubmitButton />

      {state.error ? (
        <p className="w-full text-xs font-medium text-rose-700">{state.error}</p>
      ) : null}
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "…" : "Anlegen"}
    </Button>
  );
}
