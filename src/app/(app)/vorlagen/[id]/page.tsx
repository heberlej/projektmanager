import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  addTemplatePhaseAction,
  addTemplateTaskAction,
  deleteTemplateAction,
  deleteTemplatePhaseAction,
  deleteTemplateTaskAction,
  updateTemplateAction,
} from "@/lib/actions";
import { Button, Card, CardBody, CardHeader, CardTitle, Field, Input } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";

export const dynamic = "force-dynamic";

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const template = await prisma.template.findUnique({
    where: { id },
    include: {
      phases: {
        orderBy: { position: "asc" },
        include: { tasks: { orderBy: { position: "asc" } } },
      },
    },
  });
  if (!template) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <nav className="mb-3 text-sm text-slate-500">
        <Link href="/vorlagen" className="hover:underline">
          Vorlagen
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-slate-700">{template.name}</span>
      </nav>

      <h1 className="mb-4 text-xl font-semibold text-slate-900">{template.name}</h1>

      <div className="space-y-4">
        {template.phases.map((phase) => (
          <Card key={phase.id}>
            <CardHeader className="flex items-center gap-3">
              <CardTitle className="flex-1">{phase.title}</CardTitle>
              <span className="text-xs text-slate-500">{phase.tasks.length} Aufgaben</span>
              <form action={deleteTemplatePhaseAction}>
                <input type="hidden" name="phaseId" value={phase.id} />
                <input type="hidden" name="templateId" value={template.id} />
                <ConfirmButton message={`Phase "${phase.title}" löschen?`}>Löschen</ConfirmButton>
              </form>
            </CardHeader>
            <CardBody className="space-y-1">
              {phase.tasks.map((task) => (
                <div key={task.id} className="group flex items-start gap-2 rounded-md px-1 py-1 hover:bg-slate-50">
                  <span aria-hidden className="pt-0.5 text-xs text-slate-400">
                    ☐
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-800">{task.title}</p>
                    {task.notes ? <p className="text-xs text-slate-500">{task.notes}</p> : null}
                  </div>
                  <form
                    action={deleteTemplateTaskAction}
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <input type="hidden" name="taskId" value={task.id} />
                    <input type="hidden" name="templateId" value={template.id} />
                    <Button type="submit" variant="ghost" size="sm" aria-label="Aufgabe löschen">
                      ✕
                    </Button>
                  </form>
                </div>
              ))}

              <form action={addTemplateTaskAction} className="flex gap-2 pt-1">
                <input type="hidden" name="phaseId" value={phase.id} />
                <input type="hidden" name="templateId" value={template.id} />
                <Input name="title" placeholder="Aufgabe hinzufügen …" required maxLength={300} className="h-8" />
                <Input name="notes" placeholder="Hinweis (optional)" maxLength={2000} className="h-8 max-w-48" />
                <Button type="submit" variant="secondary" size="sm" className="h-8">
                  +
                </Button>
              </form>
            </CardBody>
          </Card>
        ))}

        <Card>
          <CardBody className="py-3">
            <form action={addTemplatePhaseAction} className="flex gap-2">
              <input type="hidden" name="templateId" value={template.id} />
              <Input name="title" placeholder="Neue Phase …" required maxLength={160} />
              <Button type="submit" variant="secondary">
                Phase hinzufügen
              </Button>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Stammdaten</CardTitle>
          </CardHeader>
          <CardBody>
            <form action={updateTemplateAction} className="space-y-3">
              <input type="hidden" name="templateId" value={template.id} />
              <Field label="Name">
                <Input name="name" defaultValue={template.name} required maxLength={160} />
              </Field>
              <Field label="Beschreibung">
                <Input name="description" defaultValue={template.description ?? ""} maxLength={2000} />
              </Field>
              <div className="flex items-center gap-3">
                <Button type="submit">Speichern</Button>
              </div>
            </form>

            <form action={deleteTemplateAction} className="mt-4 border-t border-slate-100 pt-3">
              <input type="hidden" name="templateId" value={template.id} />
              <ConfirmButton
                size="md"
                message={`Vorlage "${template.name}" löschen? Bereits daraus angelegte Projekte bleiben unverändert.`}
              >
                Vorlage löschen
              </ConfirmButton>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
