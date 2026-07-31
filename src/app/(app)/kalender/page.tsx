import Link from "next/link";
import { calendarEntries } from "@/lib/service";
import {
  addMonths,
  entryHref,
  formatRange,
  KIND_CHIP,
  KIND_LABEL,
  monthFmt,
  monthGrid,
  parseMonthParam,
  toMonthParam,
} from "@/lib/planning";
import { CalendarMonth } from "@/components/calendar-month";
import { Card, CardBody, CardHeader, CardTitle, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function CalendarPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const monthStart = parseMonthParam(one(params.monat));

  // Das Raster zeigt angeschnittene Nachbarmonate mit - die muessen mitgeladen werden.
  const weeks = monthGrid(monthStart);
  const from = weeks[0][0];
  const letzteWoche = weeks[weeks.length - 1];
  const to = new Date(letzteWoche[6].getTime() + 86_400_000);

  const entries = await calendarEntries(from, to);
  const imMonat = entries.filter((e) => e.start.getMonth() === monthStart.getMonth());

  const vorher = toMonthParam(addMonths(monthStart, -1));
  const nachher = toMonthParam(addMonths(monthStart, 1));

  return (
    <div className="mx-auto max-w-[100rem]">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Kalender</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {entries.length === 0
              ? "Nichts terminiert"
              : `${entries.length} ${entries.length === 1 ? "Termin" : "Termine"} im Zeitraum`}
          </p>
        </div>

        <nav className="flex items-center gap-1">
          <MonthLink monat={vorher} label="‹" title="Vorheriger Monat" />
          <span className="min-w-40 px-2 text-center text-sm font-medium text-slate-800">
            {monthFmt.format(monthStart)}
          </span>
          <MonthLink monat={nachher} label="›" title="Nächster Monat" />
          <Link
            href="/kalender"
            className="ml-2 flex h-9 items-center rounded-md bg-white px-3 text-sm font-medium text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50"
          >
            Heute
          </Link>
        </nav>
      </header>

      <Card className="mb-4 overflow-hidden">
        <CalendarMonth monthStart={monthStart} entries={entries} />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Was in diesem Monat ansteht</CardTitle>
        </CardHeader>
        <CardBody className="space-y-1.5">
          {imMonat.length === 0 ? (
            <EmptyState
              title="Keine Termine in diesem Monat"
              hint="Termine setzt du im Projekt: bei den Einstellungen für das ganze Projekt, in der Aufgabenliste für Phase oder Aufgabe."
            />
          ) : (
            imMonat.map((entry) => (
              <Link
                key={`${entry.kind}-${entry.id}`}
                href={entryHref(entry)}
                className="flex flex-wrap items-center gap-2 rounded-md px-1 py-1.5 hover:bg-slate-50"
              >
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${KIND_CHIP[entry.kind]}`}
                >
                  {KIND_LABEL[entry.kind]}
                </span>
                <span
                  className={`text-sm font-medium ${entry.done ? "text-slate-400 line-through" : "text-slate-900"}`}
                >
                  {entry.title}
                </span>
                <span className="text-xs text-slate-500">
                  {entry.projectName ? `${entry.projectName} · ${entry.customer}` : "ohne Projekt"}
                </span>
                <span className="ml-auto text-xs tabular-nums text-slate-600">
                  {formatRange(entry.start, entry.end)}
                </span>
              </Link>
            ))
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function MonthLink({ monat, label, title }: { monat: string; label: string; title: string }) {
  return (
    <Link
      href={`/kalender?monat=${monat}`}
      title={title}
      aria-label={title}
      className="flex h-9 w-9 items-center justify-center rounded-md bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
    >
      {label}
    </Link>
  );
}
