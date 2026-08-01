import Link from "next/link";
import { suche, type SuchArt } from "@/lib/service";
import { Card, CardBody, EmptyState } from "@/components/ui";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const ART_LABEL: Record<SuchArt, string> = {
  PROJEKT: "Projekt",
  NOTIZ: "Notiz",
  AUFGABE: "Aufgabe",
  MAIL: "Mail",
  DATEI: "Datei",
};

const ART_CHIP: Record<SuchArt, string> = {
  PROJEKT: "bg-blue-100 text-blue-800 ring-blue-300",
  NOTIZ: "bg-violet-100 text-violet-800 ring-violet-300",
  AUFGABE: "bg-emerald-100 text-emerald-800 ring-emerald-300",
  MAIL: "bg-amber-100 text-amber-900 ring-amber-300",
  DATEI: "bg-cyan-100 text-cyan-800 ring-cyan-300",
};

export default async function SuchePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const roh = params.q;
  const q = (Array.isArray(roh) ? (roh[0] ?? "") : (roh ?? "")).trim();

  const treffer = q ? await suche(q) : [];

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-4">
        <h1 className="text-xl font-semibold text-slate-900">Suche</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Über Projekte, Notizen, Aufgaben, angeheftete Mails und Dateinamen –
          Archiviertes eingeschlossen.
        </p>
      </header>

      <Card className="mb-4">
        <CardBody className="py-3">
          <form className="flex flex-wrap items-end gap-2">
            <label className="min-w-64 flex-1">
              <span className="mb-1 block text-xs font-medium text-slate-600">Suchbegriff</span>
              <input
                name="q"
                defaultValue={q}
                autoFocus
                placeholder="z. B. Exchange Migration"
                className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400"
              />
            </label>
            <button
              type="submit"
              className="h-9 rounded-full bg-akzent px-3.5 text-sm font-medium text-akzent-auf hover:bg-akzent-stark"
            >
              Suchen
            </button>
          </form>
          <p className="mt-2 text-xs text-slate-500">
            Mehrere Wörter werden verundet. <code className="rounded bg-slate-100 px-1">&quot;in
            Anführungszeichen&quot;</code> sucht die Wortfolge, <code className="rounded bg-slate-100 px-1">-wort</code>{" "}
            schließt aus. Gesucht wird auf Wortstämmen: „Migration" findet auch „Migrationen".
          </p>
        </CardBody>
      </Card>

      {!q ? (
        <EmptyState title="Wonach suchst du?" hint="Der Suchbegriff steht oben." />
      ) : treffer.length === 0 ? (
        <EmptyState
          title="Nichts gefunden"
          hint="Anderer Begriff, oder weniger Wörter – es müssen alle vorkommen."
        />
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">
            {treffer.length} {treffer.length === 1 ? "Treffer" : "Treffer"}, nach Relevanz sortiert
          </p>
          {treffer.map((t) => (
            <Link
              key={`${t.art}-${t.id}`}
              href={t.href}
              className="block rounded-lg border border-slate-200 bg-white p-3 shadow-sm hover:bg-slate-50"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                    ART_CHIP[t.art],
                  )}
                >
                  {ART_LABEL[t.art]}
                </span>
                <span className="text-sm font-medium text-slate-900">{t.titel}</span>
                {t.archiviert ? (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 ring-1 ring-slate-300 ring-inset">
                    archiviert
                  </span>
                ) : null}
              </div>
              {t.auszug ? (
                /* Der Auszug ist in service.ts escaped worden, das <b> um die
                   Fundstelle setzt erst der Schritt danach. Siehe auszugAlsHtml. */
                <p
                  className="mt-1 text-xs leading-relaxed text-slate-600 [&_b]:font-semibold [&_b]:text-slate-900"
                  dangerouslySetInnerHTML={{ __html: t.auszug }}
                />
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
