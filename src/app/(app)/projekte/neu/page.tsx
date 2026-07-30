import Link from "next/link";
import { listCustomers, listTags, listTemplates } from "@/lib/service";
import { ProjectForm } from "@/components/project-form";
import { Card, CardBody } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  const [customers, tags, templates] = await Promise.all([
    listCustomers(),
    listTags(),
    listTemplates(),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <nav className="mb-4 text-sm text-slate-500">
        <Link href="/projekte" className="hover:underline">
          Projekte
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-slate-700">Neu</span>
      </nav>

      <h1 className="mb-4 text-xl font-semibold text-slate-900">Neues Projekt</h1>

      <Card>
        <CardBody className="py-4">
          <ProjectForm
            customers={customers}
            tags={tags}
            templates={templates.map((t) => ({ id: t.id, name: t.name }))}
          />
        </CardBody>
      </Card>
    </div>
  );
}
