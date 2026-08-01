import Link from "next/link";
import {
  PAPIERKORB_TAGE,
  papierkorbBereinigen,
  papierkorbInhalt,
  type PapierkorbArt,
} from "@/lib/service";
import { purgeAction, restoreAction } from "@/lib/actions";
import { Button, Card, CardBody, EmptyState } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { KOPFZEILE, TabellenRahmen, ZEILE } from "@/components/sortable";
import { formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ART_LABEL: Record<PapierkorbArt, string> = {
  AUFGABE: "Aufgabe",
  NOTIZ: "Notiz",
  DATEI: "Datei",
};

const ART_CHIP: Record<PapierkorbArt, string> = {
  AUFGABE: "bg-emerald-100 text-emerald-800 ring-emerald-300",
  NOTIZ: "bg-violet-100 text-violet-800 ring-violet-300",
  DATEI: "bg-cyan-100 text-cyan-800 ring-cyan-300",
};

export default async function PapierkorbPage() {
  // Beim Oeffnen aufraeumen. Ein eigener Dienst dafuer waere ueberzogen, und
  // wer nie hierher kommt, dem schadet das Liegenbleiben nicht.
  await papierkorbBereinigen();
  const eintraege = await papierkorbInhalt();

  return (
    <div className="mx-auto max-w-4xl">
      <header className="glas-kante sticky top-0 z-20 -mx-4 mb-4 px-4 py-3 md:-mx-8 md:px-8">
        <h1 className="text-xl font-semibold text-slate-900">Papierkorb</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Gelöschte Aufgaben, Notizen und Dateien – {PAPIERKORB_TAGE} Tage lang
          wiederherstellbar, danach räumt die Seite sie beim Öffnen weg.
        </p>
      </header>

      {eintraege.length === 0 ? (
        <EmptyState
          title="Nichts im Papierkorb"
          hint="Gelöschtes landet hier, bevor es endgültig verschwindet. Projekte gehen stattdessen ins Archiv."
        />
      ) : (
        <TabellenRahmen>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className={KOPFZEILE}>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  Was
                </th>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  Projekt
                </th>
                <th scope="col" className="w-40 px-3 py-2.5 font-medium">
                  Gelöscht
                </th>
                <th scope="col" className="w-44 px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {eintraege.map((e) => (
                <tr key={`${e.art}-${e.id}`} className={ZEILE}>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                          ART_CHIP[e.art],
                        )}
                      >
                        {ART_LABEL[e.art]}
                      </span>
                      <span className="text-slate-900">{e.titel}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-slate-600">
                    {e.projektId ? (
                      <Link href={`/projekte/${e.projektId}`} className="hover:underline">
                        {e.projektName}
                      </Link>
                    ) : (
                      <span className="text-slate-500">ohne Projekt</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs tabular-nums text-slate-500">
                    {formatDateTime(e.geloeschtAm)}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <form action={restoreAction}>
                        <input type="hidden" name="art" value={e.art} />
                        <input type="hidden" name="id" value={e.id} />
                        <Button type="submit" variant="secondary" size="sm">
                          Wiederherstellen
                        </Button>
                      </form>
                      <form action={purgeAction}>
                        <input type="hidden" name="art" value={e.art} />
                        <input type="hidden" name="id" value={e.id} />
                        <ConfirmButton message={`„${e.titel}" endgültig löschen?`}>
                          Endgültig
                        </ConfirmButton>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TabellenRahmen>
      )}
    </div>
  );
}
