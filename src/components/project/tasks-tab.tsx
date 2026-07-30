import {
  addPhaseAction,
  addTaskAction,
  applyTemplateAction,
  deletePhaseAction,
  deleteTaskAction,
  toggleTaskAction,
} from "@/lib/actions";
import { Button, Card, CardBody, CardHeader, CardTitle, EmptyState, Input, Select } from "../ui";
import { ConfirmButton } from "../confirm-button";
import { ProgressBar } from "../bits";
import type { ProjectDetail } from "./types";

export function TasksTab({
  project,
  templates,
}: {
  project: ProjectDetail;
  templates: { id: string; name: string }[];
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
        const done = phase.tasks.filter((t) => t.done).length;
        return (
          <Card key={phase.id}>
            <CardHeader className="flex items-center gap-3">
              <CardTitle className="flex-1">{phase.title}</CardTitle>
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
  task: { id: string; title: string; done: boolean; notes: string | null };
}) {
  return (
    <div className="group flex items-start gap-2 rounded-md px-1 py-1 hover:bg-slate-50">
      <form action={toggleTaskAction} className="pt-0.5">
        <input type="hidden" name="taskId" value={task.id} />
        <input type="hidden" name="projectId" value={projectId} />
        <button
          type="submit"
          aria-label={task.done ? "Als offen markieren" : "Als erledigt markieren"}
          className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] leading-none ${
            task.done
              ? "border-emerald-500 bg-emerald-500 text-white"
              : "border-slate-300 bg-white hover:border-slate-400"
          }`}
        >
          {task.done ? "✓" : ""}
        </button>
      </form>

      <div className="min-w-0 flex-1">
        <p className={`text-sm ${task.done ? "text-slate-400 line-through" : "text-slate-800"}`}>
          {task.title}
        </p>
        {task.notes ? <p className="mt-0.5 text-xs text-slate-500">{task.notes}</p> : null}
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
