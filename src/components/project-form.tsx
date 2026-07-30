"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createProjectAction, type ActionState } from "@/lib/actions";
import { Button, Field, Input, Select, Textarea } from "./ui";
import { PRIORITY_LABEL, PRIORITY_ORDER, STATUS_LABEL, STATUS_ORDER, tagChipClass } from "@/lib/status";

type Option = { id: string; name: string };

export function ProjectForm({
  customers,
  tags,
  templates,
}: {
  customers: string[];
  tags: { id: string; name: string; color: string }[];
  templates: Option[];
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(createProjectAction, {});

  return (
    <form action={formAction} className="space-y-4">
      <Field label="Projektname">
        <Input name="name" required maxLength={200} placeholder="z. B. Exchange-Migration Musterfirma" />
      </Field>

      <Field label="Kunde" hint="Bestehende Kunden werden vorgeschlagen - einheitliche Schreibweise spart später Ärger.">
        <Input name="customer" required maxLength={160} list="kunden-liste" autoComplete="off" />
        <datalist id="kunden-liste">
          {customers.map((customer) => (
            <option key={customer} value={customer} />
          ))}
        </datalist>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Status">
          <Select name="status" defaultValue="NEU">
            {STATUS_ORDER.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Priorität">
          <Select name="priority" defaultValue="NORMAL">
            {PRIORITY_ORDER.map((priority) => (
              <option key={priority} value={priority}>
                {PRIORITY_LABEL[priority]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field
        label="Vorlage"
        hint="Phasen und Aufgaben werden kopiert. Spätere Änderungen an der Vorlage berühren dieses Projekt nicht."
      >
        <Select name="templateId" defaultValue="">
          <option value="">Ohne Vorlage</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </Select>
      </Field>

      <fieldset>
        <legend className="mb-1 block text-xs font-medium text-slate-600">Projektart</legend>
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <label
              key={tag.id}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${tagChipClass(tag.color)}`}
            >
              <input type="checkbox" name="tagIds" value={tag.id} className="h-3 w-3 accent-slate-900" />
              {tag.name}
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="Beschreibung">
        <Textarea name="description" rows={4} maxLength={5000} />
      </Field>

      {state.error ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Wird angelegt …" : "Projekt anlegen"}
    </Button>
  );
}
