import {
  deleteProjectAction,
  setArchivedAction,
  templateFromProjectAction,
  updateProjectAction,
} from "@/lib/actions";
import { Button, Card, CardBody, CardHeader, CardTitle, Field, Input, Select, Textarea } from "../ui";
import { ConfirmButton } from "../confirm-button";
import { StatusBadge } from "../bits";
import { formatDateTime } from "@/lib/utils";
import { PRIORITY_LABEL, PRIORITY_ORDER, tagChipClass, type Status } from "@/lib/status";
import type { ProjectDetail } from "./types";

export function SettingsTab({
  project,
  customers,
  tags,
}: {
  project: ProjectDetail;
  customers: string[];
  tags: { id: string; name: string; color: string }[];
}) {
  const selected = new Set(project.tags.map((t) => t.tagId));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Stammdaten</CardTitle>
        </CardHeader>
        <CardBody>
          <form action={updateProjectAction} className="space-y-4">
            <input type="hidden" name="id" value={project.id} />

            <Field label="Projektname">
              <Input name="name" defaultValue={project.name} required maxLength={200} />
            </Field>

            <Field label="Kunde">
              <Input
                name="customer"
                defaultValue={project.customer}
                required
                maxLength={160}
                list="kunden-liste-detail"
                autoComplete="off"
              />
              <datalist id="kunden-liste-detail">
                {customers.map((customer) => (
                  <option key={customer} value={customer} />
                ))}
              </datalist>
            </Field>

            <Field label="Priorität">
              <Select name="priority" defaultValue={project.priority}>
                {PRIORITY_ORDER.map((priority) => (
                  <option key={priority} value={priority}>
                    {PRIORITY_LABEL[priority]}
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
                    <input
                      type="checkbox"
                      name="tagIds"
                      value={tag.id}
                      defaultChecked={selected.has(tag.id)}
                      className="h-3 w-3 accent-slate-900"
                    />
                    {tag.name}
                  </label>
                ))}
              </div>
            </fieldset>

            <Field label="Beschreibung">
              <Textarea name="description" rows={4} defaultValue={project.description ?? ""} maxLength={5000} />
            </Field>

            <Button type="submit">Speichern</Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Statusverlauf</CardTitle>
        </CardHeader>
        <CardBody className="space-y-1.5">
          {project.statusEvents.length === 0 ? (
            <p className="text-sm text-slate-500">Noch keine Wechsel protokolliert.</p>
          ) : (
            project.statusEvents.map((event) => (
              <div key={event.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="w-36 shrink-0 text-xs text-slate-500">
                  {formatDateTime(event.changedAt)}
                </span>
                {event.from ? (
                  <>
                    <StatusBadge status={event.from as Status} />
                    <span className="text-slate-400">→</span>
                  </>
                ) : (
                  <span className="text-xs text-slate-400">angelegt als</span>
                )}
                <StatusBadge status={event.to as Status} />
              </div>
            ))
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Vorlage aus diesem Projekt erzeugen</CardTitle>
        </CardHeader>
        <CardBody>
          <form action={templateFromProjectAction} className="space-y-3">
            <input type="hidden" name="projectId" value={project.id} />
            <Field label="Name der Vorlage">
              <Input name="name" required maxLength={160} defaultValue={project.name} />
            </Field>
            <Field label="Beschreibung">
              <Input name="description" maxLength={2000} />
            </Field>
            <Button type="submit" variant="secondary">
              Vorlage erzeugen
            </Button>
          </form>
          <p className="mt-2 text-xs text-slate-500">
            Übernimmt alle Phasen und Aufgaben als Kopie – erledigt/offen wird nicht übernommen.
          </p>
        </CardBody>
      </Card>

      <Card className="border-rose-200">
        <CardHeader className="border-rose-200">
          <CardTitle className="text-rose-800">Archivieren und Löschen</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-wrap items-center gap-3">
          <form action={setArchivedAction}>
            <input type="hidden" name="id" value={project.id} />
            <input type="hidden" name="archived" value={project.archived ? "false" : "true"} />
            <Button type="submit" variant="secondary">
              {project.archived ? "Aus Archiv holen" : "Archivieren"}
            </Button>
          </form>

          <form action={deleteProjectAction}>
            <input type="hidden" name="id" value={project.id} />
            <ConfirmButton
              size="md"
              message={`"${project.name}" endgültig löschen? Notizen, Dateien und Mail-Verknüpfungen gehen mit verloren.`}
            >
              Endgültig löschen
            </ConfirmButton>
          </form>

          <p className="text-xs text-slate-500">
            Archivieren ist der Normalfall – abgeschlossene Projekte verschwinden aus der Übersicht,
            bleiben aber auffindbar.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
