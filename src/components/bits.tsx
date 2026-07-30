import { Badge } from "./ui";
import { cn } from "@/lib/utils";
import {
  PRIORITY_BADGE,
  PRIORITY_LABEL,
  STATUS_BADGE,
  STATUS_DOT,
  STATUS_LABEL,
  tagChipClass,
  type Priority,
  type Status,
} from "@/lib/status";

export function StatusBadge({ status }: { status: Status }) {
  return (
    <Badge className={STATUS_BADGE[status]}>
      <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[status])} aria-hidden />
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  if (priority === "NORMAL") return null;
  return <Badge className={PRIORITY_BADGE[priority]}>{PRIORITY_LABEL[priority]}</Badge>;
}

export function TagChip({ name, color }: { name: string; color: string }) {
  return <Badge className={tagChipClass(color)}>{name}</Badge>;
}

export function ProgressBar({
  done,
  total,
  className,
}: {
  done: number;
  total: number;
  className?: string;
}) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
        <div
          className={cn(
            "h-full rounded-full transition-[width]",
            pct === 100 ? "bg-emerald-500" : "bg-blue-500",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-16 shrink-0 text-right text-xs tabular-nums text-slate-500">
        {total === 0 ? "–" : `${done}/${total}`}
      </span>
    </div>
  );
}

/** Kleine Zahl mit Symbol, z. B. Anzahl Dateien auf der Projektkarte. */
export function CountHint({
  icon,
  count,
  title,
}: {
  icon: string;
  count: number;
  title: string;
}) {
  if (count === 0) return null;
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-slate-500" title={title}>
      <span aria-hidden>{icon}</span>
      {count}
    </span>
  );
}
