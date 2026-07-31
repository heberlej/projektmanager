import Link from "next/link";
import {
  byStart,
  entryHref,
  formatTime,
  isSameDay,
  isToday,
  KIND_BAR,
  KIND_LABEL,
  monthGrid,
  overlapsDay,
  WEEKDAY_LABELS,
  type CalendarEntry,
} from "@/lib/planning";
import { cn } from "@/lib/utils";

/**
 * Monatsraster, Montag bis Sonntag. Ein Block, der ueber mehrere Tage laeuft,
 * erscheint in jedem betroffenen Tag - mit Uhrzeit nur am Starttag. Das ist
 * ehrlicher als ein durchgezogener Balken, der bei Zeilenumbruechen luegt.
 */
export function CalendarMonth({
  monthStart,
  entries,
}: {
  monthStart: Date;
  entries: CalendarEntry[];
}) {
  const weeks = monthGrid(monthStart);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[52rem]">
        <div className="grid grid-cols-7 gap-px border-b border-slate-200 pb-1">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="px-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-px bg-slate-200">
          {weeks.flat().map((day) => {
            const imMonat = day.getMonth() === monthStart.getMonth();
            const desTages = entries.filter((entry) => overlapsDay(entry, day)).sort(byStart);

            return (
              <div
                key={day.toISOString()}
                className={cn(
                  "min-h-28 bg-white p-1.5",
                  !imMonat && "bg-slate-50/80",
                  isToday(day) && "ring-2 ring-blue-400 ring-inset",
                )}
              >
                <div className="mb-1 flex items-baseline gap-1">
                  <span
                    className={cn(
                      "text-xs tabular-nums",
                      imMonat ? "font-medium text-slate-700" : "text-slate-400",
                      isToday(day) && "font-semibold text-blue-700",
                    )}
                  >
                    {day.getDate()}
                  </span>
                  {isToday(day) ? (
                    <span className="text-[10px] font-medium text-blue-600">heute</span>
                  ) : null}
                </div>

                <div className="space-y-1">
                  {desTages.map((entry) => (
                    <DayEntry key={`${entry.kind}-${entry.id}`} entry={entry} day={day} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DayEntry({ entry, day }: { entry: CalendarEntry; day: Date }) {
  const beginntHeute = isSameDay(entry.start, day);
  const endetHeute = isSameDay(entry.end, day);

  return (
    <Link
      href={entryHref(entry)}
      title={
        entry.projectName
          ? `${KIND_LABEL[entry.kind]} · ${entry.projectName} (${entry.customer})`
          : `${KIND_LABEL[entry.kind]} · ohne Projekt`
      }
      className={cn(
        "block rounded px-1.5 py-1 text-[11px] leading-tight hover:bg-slate-100",
        entry.done && "opacity-50",
      )}
    >
      <span className="flex items-center gap-1">
        <span className={cn("h-2 w-0.5 shrink-0 rounded-full", KIND_BAR[entry.kind])} aria-hidden />
        <span className="truncate font-medium text-slate-800">
          {entry.done ? <s>{entry.title}</s> : entry.title}
        </span>
      </span>
      <span className="block truncate pl-1.5 text-slate-500">
        {beginntHeute ? formatTime(entry.start) : endetHeute ? `bis ${formatTime(entry.end)}` : "ganztags"}
        {" · "}
        {entry.projectName ?? "ohne Projekt"}
      </span>
    </Link>
  );
}
