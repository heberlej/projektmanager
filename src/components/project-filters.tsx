"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input, Select } from "./ui";
import { STATUS_LABEL, STATUS_ORDER } from "@/lib/status";
import { cn } from "@/lib/utils";

type Option = { id: string; name: string };

export function ProjectFilters({
  customers,
  tags,
}: {
  customers: string[];
  tags: Option[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [q, setQ] = useState(params.get("q") ?? "");

  // Suche entprellt in die URL schreiben, damit der Server neu filtert.
  useEffect(() => {
    const current = params.get("q") ?? "";
    if (q === current) return;
    const timer = setTimeout(() => update("q", q), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  // Muss zur Vorgabe der Seite passen: Tabelle ohne Parameter, Board explizit.
  const view = params.get("ansicht") === "board" ? "board" : "tabelle";
  const showArchived = params.get("archiv") === "1";

  return (
    <div className="mb-4 flex flex-wrap items-end gap-2">
      <div className="min-w-56 flex-1">
        <Input
          type="search"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Suchen: Projekt, Kunde, Notiz, Mailbetreff …"
          aria-label="Projekte durchsuchen"
        />
      </div>

      <Select
        className="w-auto"
        value={params.get("kunde") ?? ""}
        onChange={(event) => update("kunde", event.target.value)}
        aria-label="Nach Kunde filtern"
      >
        <option value="">Alle Kunden</option>
        {customers.map((customer) => (
          <option key={customer} value={customer}>
            {customer}
          </option>
        ))}
      </Select>

      <Select
        className="w-auto"
        value={params.get("tag") ?? ""}
        onChange={(event) => update("tag", event.target.value)}
        aria-label="Nach Tag filtern"
      >
        <option value="">Alle Projektarten</option>
        {tags.map((tag) => (
          <option key={tag.id} value={tag.id}>
            {tag.name}
          </option>
        ))}
      </Select>

      <Select
        className="w-auto"
        value={params.get("status") ?? ""}
        onChange={(event) => update("status", event.target.value)}
        aria-label="Nach Status filtern"
      >
        <option value="">Alle Status</option>
        {STATUS_ORDER.map((status) => (
          <option key={status} value={status}>
            {STATUS_LABEL[status]}
          </option>
        ))}
      </Select>

      <div className="flex overflow-hidden rounded-md ring-1 ring-slate-300">
        {(["tabelle", "board"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => update("ansicht", value === "tabelle" ? "" : value)}
            className={cn(
              "h-9 px-3 text-sm",
              view === value ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50",
            )}
          >
            {value === "board" ? "Board" : "Tabelle"}
          </button>
        ))}
      </div>

      <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md bg-white px-3 text-sm text-slate-700 ring-1 ring-slate-300">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(event) => update("archiv", event.target.checked ? "1" : "")}
          className="h-3.5 w-3.5 accent-slate-900"
        />
        Archiv
      </label>
    </div>
  );
}
