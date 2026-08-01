import {
  addPhaseAction,
  addTaskAction,
  applyTemplateAction,
  applyTemplatePhaseAction,
  deletePhaseAction,
  deleteTaskAction,
  setTaskDetailsAction,
  setTaskStatusAction,
  toggleTaskAction,
} from "@/lib/actions";
import {
  PRIORITY_LABEL,
  PRIORITY_ORDER,
  TASK_DONE,
  TASK_STATUS_LABEL,
  TASK_STATUS_ORDER,
  type Priority,
  type TaskStatus,
} from "@/lib/status";
import { AutoForm } from "../zeilen-bedienung";
import { cn } from "@/lib/utils";

/** Datum als Wert fuer <input type="date">. */
function alsTagesWert(wert: Date | null): string {
  if (!wert) return "";
  const d = new Date(wert);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function istUeberfaellig(dueDate: Date | null, status: TaskStatus): boolean {
  if (!dueDate || status === TASK_DONE) return false;
  return new Date(dueDate) < new Date(new Date().toDateString());
}
import { Button, Card, CardBody, CardHeader, CardTitle, EmptyState, Input, Select } from "../ui";
import { ConfirmButton } from "../confirm-button";
import { ProgressBar } from "../bits";
import { ScheduleForm } from "../schedule-form";
import { formatRange, KIND_CHIP, type PlannedKind } from "@/lib/planning";
import type { ProjectDetail } from "./types";

type Termin = { plannedStart: Date | null; plannedEnd: Date | null };

/** Zeigt den Termin an, wenn einer gesetzt ist - sonst nichts. */
function TerminChip({ start, end, kind }: { start: Date | null; end: Date | null; kind: PlannedKind }) {
  if (!start || !end) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${KIND_CHIP[kind]}`}
    >
      {formatRange(start, end)}
    </span>
  );
}

/** Zusammengeklappter Termin-Editor - die Aufgabenliste soll ruhig bleiben. */
function TerminEditor({
  kind,
  id,
  projectId,
  termin,
  variant = "block",
}: {
  kind: PlannedKind;
  id: string;
  projectId: string;
  termin: Termin;
  variant?: "block" | "inline";
}) {
  const gesetzt = Boolean(termin.plannedStart && termin.plannedEnd);
  return (
    <details className="group">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs text-slate-500 hover:text-slate-800">
        <span aria-hidden>🕒</span>
        {gesetzt ? "Termin ändern" : "Termin setzen"}
      </summary>
      <div className="mt-2 rounded-md bg-slate-50 p-2">
        <ScheduleForm
          kind={kind}
          id={id}
          projectId={projectId}
          start={termin.plannedStart}
          end={termin.plannedEnd}
          variant={variant}
        />
      </div>
    </details>
  );
}

export type VorlagenAuswahl = {
  id: string;
  name: string;
  phases: { id: string; title: string; taskCount: number }[];
};

export function TasksTab({
  project,
  templates,
}: {
  project: ProjectDetail;
  templates: VorlagenAuswahl[];
}) {
  const hasContent = project.phases.length > 0 || project.tasks.length > 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="flex flex-wrap items-center gap-3 py-3">
          <ProgressBar
            className="min-w-48 flex-1"
            done={project.progress.done}
            total={project.progress.total}
          />
          <form action={applyTemplateAction} className="flex items-center gap-2">
            <input type="hidden" name="projectId" value={project.id} />
            <Select name="templateId" defaultValue="" className="h-9 w-auto" required>
              <option value="">Vorlage anhängen …</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </Select>
            <Button type="submit" variant="secondary">
              Anhängen
            </Button>
          </form>

          {/* Mitten im Projekt will man selten die ganze Vorlage, sondern einen
              Block daraus - etwa die Nacharbeit. */}
          <form action={applyTemplatePhaseAction} className="flex items-center gap-2">
            <input type="hidden" name="projectId" value={project.id} />
            <Select name="templatePhaseId" defaultValue="" className="h-9 w-auto" required>
              <option value="">Einzelne Phase …</option>
              {templates.map((template) => (
                <optgroup key={template.id} label={template.name}>
                  {template.phases.map((phase) => (
                    <option key={phase.id} value={phase.id}>
                      {phase.title} ({phase.taskCount})
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
            <Button type="submit" variant="secondary">
              Einsetzen
            </Button>
          </form>
        </CardBody>
      </Card>

      {!hasContent ? (
        <EmptyState
          title="Noch keine Aufgaben"
          hint="Lege eine Phase an oder hänge eine Vorlage an."
        />
      ) : null}

      {project.tasks.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Ohne Phase</CardTitle>
          </CardHeader>
          <CardBody className="space-y-1">
            {project.tasks.map((task) => (
              <TaskRow key={task.id} projectId={project.id} task={task} />
            ))}
            <AddTaskForm projectId={project.id} />
          </CardBody>
        </Card>
      ) : null}

      {project.phases.map((phase) => {
        const done = phase.tasks.filter((t) => t.status === TASK_DONE).length;
        return (
          <Card key={phase.id}>
            <CardHeader className="flex flex-wrap items-center gap-3">
              <CardTitle className="flex-1">{phase.title}</CardTitle>
              <TerminChip kind="PHASE" start={phase.plannedStart} end={phase.plannedEnd} />
              <span className="text-xs tabular-nums text-slate-500">
                {done}/{phase.tasks.length}
              </span>
              <form action={deletePhaseAction}>
                <input type="hidden" name="phaseId" value={phase.id} />
                <input type="hidden" name="projectId" value={project.id} />
                <ConfirmButton message={`Phase "${phase.title}" mit allen Aufgaben löschen?`}>
                  Löschen
                </ConfirmButton>
              </form>
            </CardHeader>
            <CardBody className="space-y-1">
              <div className="pb-1">
                <TerminEditor kind="PHASE" id={phase.id} projectId={project.id} termin={phase} />
              </div>
              {phase.tasks.map((task) => (
                <TaskRow key={task.id} projectId={project.id} task={task} />
              ))}
              <AddTaskForm projectId={project.id} phaseId={phase.id} />
            </CardBody>
          </Card>
        );
      })}

      <Card>
        <CardBody className="py-3">
          <form action={addPhaseAction} className="flex gap-2">
            <input type="hidden" name="projectId" value={project.id} />
            <Input name="title" placeholder="Neue Phase …" required maxLength={160} />
            <Button type="submit" variant="secondary">
              Phase hinzufügen
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}

function TaskRow({
  projectId,
  task,
}: {
  projectId: string;
  task: {
    id: string;
    title: string;
    status: TaskStatus;
    priority: Priority;
    dueDate: Date | null;
    notes: string | null;
    mailLink?: { subject: string; deeplinkUrl: string | null } | null;
  } & Termin;
}) {
  const erledigt = task.status === TASK_DONE;
  return (
    <div className="group flex items-start gap-2 rounded-md px-1 py-1 hover:bg-slate-50">
      <form action={toggleTaskAction} className="pt-0.5">
        <input type="hidden" name="taskId" value={task.id} />
        <input type="hidden" name="projectId" value={projectId} />
        <button
          type="submit"
          aria-label={erledigt ? "Als offen markieren" : "Als erledigt markieren"}
          className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] leading-none ${
            erledigt
              ? // Eigener Token statt emerald-500, siehe globals.css: sonst ist
                // das Haekchen weder hell noch dunkel gut lesbar.
                "border-erledigt bg-erledigt text-akzent-auf"
              : "border-slate-300 bg-white hover:border-slate-400"
          }`}
        >
          {erledigt ? "✓" : ""}
        </button>
      </form>

      <div className="min-w-0 flex-1">
        <p className={`text-sm ${erledigt ? "text-slate-400 line-through" : "text-slate-800"}`}>
          {task.title}
        </p>
        {task.notes ? <p className="mt-0.5 text-xs text-slate-500">{task.notes}</p> : null}
        {/* Herkunft der Aufgabe: beantwortet spaeter "warum gibt es die
            eigentlich" mit einem Sprung zurueck in die Mail. */}
        {task.mailLink ? (
          <p className="mt-0.5 truncate text-xs text-slate-500">
            <span aria-hidden>✉ </span>
            {task.mailLink.deeplinkUrl ? (
              <a
                href={task.mailLink.deeplinkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-700 hover:underline"
                title="In Outlook öffnen"
              >
                {task.mailLink.subject}
              </a>
            ) : (
              task.mailLink.subject
            )}
          </p>
        ) : null}
        {task.plannedStart && task.plannedEnd ? (
          <p className="mt-1">
            <TerminChip kind="AUFGABE" start={task.plannedStart} end={task.plannedEnd} />
          </p>
        ) : null}
        {/* Prioritaet und Faelligkeit gibt es seit heute auch hier - die Felder
            lagen schon am Modell, sichtbar waren sie nur im freien Board. */}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <AutoForm action={setTaskDetailsAction} className="flex items-center gap-1.5">
            <input type="hidden" name="taskId" value={task.id} />
            <Select
              name="priority"
              defaultValue={task.priority}
              className="h-7 w-auto py-0 text-xs"
              aria-label={`Priorität von ${task.title}`}
            >
              {PRIORITY_ORDER.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </Select>
            <input
              type="date"
              name="dueDate"
              defaultValue={alsTagesWert(task.dueDate)}
              aria-label={`Fälligkeit von ${task.title}`}
              className={cn(
                "h-7 rounded-lg border border-slate-300 bg-white px-1.5 text-xs tabular-nums",
                istUeberfaellig(task.dueDate, task.status) && "border-rose-300 font-medium text-rose-700",
              )}
            />
            <button type="submit" className="nur-ohne-skript text-xs text-slate-500 hover:underline">
              übernehmen
            </button>
          </AutoForm>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-3">
          <form action={setTaskStatusAction} className="flex items-center gap-1">
            <input type="hidden" name="taskId" value={task.id} />
            <Select
              name="status"
              defaultValue={task.status}
              className="h-7 w-auto py-0 text-xs"
              aria-label="Status der Aufgabe"
            >
              {TASK_STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {TASK_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
            <Button type="submit" variant="ghost" size="sm" className="h-7">
              setzen
            </Button>
          </form>
          <TerminEditor
            kind="AUFGABE"
            id={task.id}
            projectId={projectId}
            termin={task}
            variant="inline"
          />
        </div>
      </div>

      <form action={deleteTaskAction} className="opacity-0 transition-opacity group-hover:opacity-100">
        <input type="hidden" name="taskId" value={task.id} />
        <input type="hidden" name="projectId" value={projectId} />
        <Button type="submit" variant="ghost" size="sm" aria-label="Aufgabe löschen">
          ✕
        </Button>
      </form>
    </div>
  );
}

function AddTaskForm({ projectId, phaseId }: { projectId: string; phaseId?: string }) {
  return (
    <form action={addTaskAction} className="flex gap-2 pt-1">
      <input type="hidden" name="projectId" value={projectId} />
      {phaseId ? <input type="hidden" name="phaseId" value={phaseId} /> : null}
      <Input name="title" placeholder="Aufgabe hinzufügen …" required maxLength={300} className="h-8" />
      <Button type="submit" variant="secondary" size="sm" className="h-8">
        +
      </Button>
    </form>
  );
}
