import Link from "next/link";
import { cn } from "@/lib/utils";

export type Richtung = "asc" | "desc";

export type Sortierung<K extends string> = { key: K; richtung: Richtung };

/**
 * Sortierung aus der Adresse lesen. Sie steht dort und nicht im Zustand einer
 * Client-Komponente: so bleibt die Seite serverseitig gerendert, und ein
 * Lesezeichen haelt die Ansicht fest.
 */
export function leseSortierung<K extends string>(
  params: Record<string, string | string[] | undefined>,
  erlaubt: readonly K[],
  vorgabe: Sortierung<K>,
): Sortierung<K> {
  const roh = params.sort;
  const key = (Array.isArray(roh) ? roh[0] : roh) ?? "";
  const rohRichtung = params.richtung;
  const richtung = (Array.isArray(rohRichtung) ? rohRichtung[0] : rohRichtung) === "desc" ? "desc" : "asc";
  return (erlaubt as readonly string[]).includes(key)
    ? { key: key as K, richtung }
    : vorgabe;
}

/** Baut die Adresse fuer einen Sortierwechsel, ohne die uebrigen Filter zu verlieren. */
function ziel(
  pfad: string,
  params: Record<string, string | string[] | undefined>,
  key: string,
  richtung: Richtung,
): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (k === "sort" || k === "richtung") continue;
    const wert = Array.isArray(v) ? v[0] : v;
    if (wert) next.set(k, wert);
  }
  next.set("sort", key);
  if (richtung === "desc") next.set("richtung", "desc");
  return `${pfad}?${next}`;
}

/**
 * Spaltenkopf, der sortiert. Ein Klick auf die aktive Spalte dreht die
 * Richtung; das Zeichen dahinter zeigt beides an, nicht nur die Richtung.
 */
export function SortHeader<K extends string>({
  pfad,
  params,
  aktiv,
  spalte,
  children,
  rechts,
  className,
}: {
  pfad: string;
  params: Record<string, string | string[] | undefined>;
  aktiv: Sortierung<K>;
  spalte: K;
  children: React.ReactNode;
  rechts?: boolean;
  className?: string;
}) {
  const istAktiv = aktiv.key === spalte;
  const naechste: Richtung = istAktiv && aktiv.richtung === "asc" ? "desc" : "asc";

  return (
    <th
      scope="col"
      aria-sort={istAktiv ? (aktiv.richtung === "asc" ? "ascending" : "descending") : "none"}
      className={cn("px-3 py-2.5 font-medium", className)}
    >
      <Link
        href={ziel(pfad, params, spalte, naechste)}
        className={cn(
          "group inline-flex items-center gap-1 rounded transition-colors hover:text-slate-900",
          rechts && "flex-row-reverse",
          istAktiv ? "text-slate-900" : "text-slate-500",
        )}
      >
        {children}
        <span
          aria-hidden
          className={cn(
            "text-[10px] leading-none transition-opacity",
            istAktiv ? "opacity-100" : "opacity-0 group-hover:opacity-40",
          )}
        >
          {istAktiv && aktiv.richtung === "desc" ? "▼" : "▲"}
        </span>
      </Link>
    </th>
  );
}

/**
 * Gemeinsamer Rahmen fuer die Tabellen: eine deckende Flaeche.
 *
 * Bewusst kein Glas - Tabellen sind Inhalt, und Inhalt bleibt lesbar. Das
 * Material liegt nur auf der Kopfzeile, unter der die Zeilen wegscrollen.
 */
export function TabellenRahmen({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

/** Kopfzeile, die beim Scrollen stehen bleibt - die Kante, an der Inhalt verschwindet. */
export const KOPFZEILE =
  "glas-kante sticky top-0 z-10 border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase";

/**
 * Zeile mit Trennlinie und ruhigem Hover.
 *
 * Der Trenner ist eingerueckt und beginnt an der Textkante, nicht am Rand der
 * Flaeche - das Muster der Systemlisten. Umgesetzt ueber den Rahmen der Zellen
 * statt der Zeile, weil nur so die erste Zelle ausgenommen werden kann.
 */
export const ZEILE =
  "group transition-colors hover:bg-slate-50 [&>td]:border-b [&>td]:border-slate-100 [&>td:first-child]:border-transparent last:[&>td]:border-0";
