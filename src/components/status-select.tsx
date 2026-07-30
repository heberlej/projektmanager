"use client";

import { useRef } from "react";
import { setStatusAction } from "@/lib/actions";
import { STATUS_BADGE, STATUS_LABEL, STATUS_ORDER, type Status } from "@/lib/status";
import { cn } from "@/lib/utils";

/** Statuswechsel direkt beim Auswählen - ohne zusätzlichen Absenden-Knopf. */
export function StatusSelect({ projectId, status }: { projectId: string; status: Status }) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={setStatusAction}>
      <input type="hidden" name="id" value={projectId} />
      <select
        name="status"
        defaultValue={status}
        onChange={() => formRef.current?.requestSubmit()}
        aria-label="Status ändern"
        className={cn(
          "h-7 cursor-pointer rounded-full border-0 px-2.5 text-xs font-medium ring-1 ring-inset focus:ring-2",
          STATUS_BADGE[status],
        )}
      >
        {STATUS_ORDER.map((value) => (
          <option key={value} value={value} className="bg-white text-slate-900">
            {STATUS_LABEL[value]}
          </option>
        ))}
      </select>
    </form>
  );
}
