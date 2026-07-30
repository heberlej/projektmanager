import Link from "next/link";
import { listTags, listTemplates } from "@/lib/service";
import { createTagAction, createTemplateAction, deleteTagAction } from "@/lib/actions";
import { Button, Card, CardBody, CardHeader, CardTitle, EmptyState, Field, Input, Select } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { TagChip } from "@/components/bits";
import { TAG_COLORS } from "@/lib/status";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const [templates, tags] = await Promise.all([listTemplates(), listTags()]);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-4 text-xl font-semibold text-slate-900">Vorlagen</h1>

      <div className="mb-6 space-y-3">
        {templates.length === 0 ? (
          <EmptyState title="Noch keine Vorlagen" hint="Lege unten eine an oder erzeuge eine aus einem laufenden Projekt." />
        ) : (
          templates.map((template) => {
            const taskCount = template.phases.reduce((n, p) => n + p.tasks.length, 0);
            return (
              <Link
                key={template.id}
                href={`/vorlagen/${template.id}`}
                className="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-slate-900">{template.name}</h2>
                    {template.description ? (
                      <p className="mt-0.5 text-sm text-slate-500">{template.description}</p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-xs text-slate-500">
                    {template.phases.length} Phasen · {taskCount} Aufgaben
                  </span>
                </div>
                {template._count.projects > 0 ? (
                  <p className="mt-2 text-xs text-slate-400">
                    {template._count.projects} Projekt(e) daraus angelegt
                  </p>
                ) : null}
              </Link>
            );
          })
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Neue Vorlage</CardTitle>
          </CardHeader>
          <CardBody>
            <form action={createTemplateAction} className="space-y-3">
              <Field label="Name">
                <Input name="name" required maxLength={160} placeholder="z. B. Tenant-to-Tenant" />
              </Field>
              <Field label="Beschreibung">
                <Input name="description" maxLength={2000} />
              </Field>
              <Button type="submit">Anlegen</Button>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Projektarten (Tags)</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {tags.map((tag) => (
                <span key={tag.id} className="inline-flex items-center gap-1">
                  <TagChip name={tag.name} color={tag.color} />
                  <form action={deleteTagAction}>
                    <input type="hidden" name="tagId" value={tag.id} />
                    <ConfirmButton
                      message={`Tag "${tag.name}" löschen? Er wird von allen Projekten entfernt.`}
                      variant="ghost"
                    >
                      ✕
                    </ConfirmButton>
                  </form>
                </span>
              ))}
            </div>

            <form action={createTagAction} className="flex gap-2">
              <Input name="name" required maxLength={60} placeholder="Neuer Tag" className="h-9" />
              <Select name="color" defaultValue="slate" className="h-9 w-auto">
                {TAG_COLORS.map((color) => (
                  <option key={color} value={color}>
                    {color}
                  </option>
                ))}
              </Select>
              <Button type="submit" variant="secondary">
                +
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
