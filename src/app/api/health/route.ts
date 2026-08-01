import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Lebenszeichen fuer den Docker-Healthcheck.
 *
 * Prueft absichtlich bis zur Datenbank durch: ein Node-Prozess, der nur noch
 * HTML ausliefert, aber keine Verbindung mehr bekommt, ist fuer diese App
 * nutzlos. Die Abfrage ist so billig wie moeglich gehalten, sie laeuft alle
 * 30 Sekunden.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    return NextResponse.json(
      { status: "fehler", grund: error instanceof Error ? error.message : "unbekannt" },
      { status: 503 },
    );
  }
}
