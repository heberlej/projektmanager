import { NextResponse } from "next/server";
import { suche } from "@/lib/service";

export const dynamic = "force-dynamic";

/**
 * Suche fuer das Sprungfenster. Dieselbe Fachlogik wie die Suchseite - das
 * Fenster ist nur eine zweite Tuer, keine zweite Wahrheit.
 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ treffer: [] });

  const treffer = await suche(q, 12);
  return NextResponse.json({
    treffer: treffer.map((t) => ({
      art: t.art,
      id: t.id,
      titel: t.titel,
      href: t.href,
      archiviert: t.archiviert,
    })),
  });
}
