"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Formular, das sich beim Aendern selbst abschickt.
 *
 * Damit verschwindet der zweite Klick auf "übernehmen": Status oder Faelligkeit
 * auswaehlen genuegt. Ohne Skript im Browser bleibt der Knopf im Inneren
 * sichtbar und alles funktioniert wie vorher - deshalb wird er erst hier
 * ausgeblendet, nicht schon serverseitig.
 */
export function AutoForm({
  action,
  children,
  className,
}: {
  action: (formData: FormData) => void | Promise<void>;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    ref.current?.classList.add("auto-abschicken");
  }, []);

  return (
    <form
      ref={ref}
      action={action}
      className={className}
      onChange={(event) => {
        // Nur Auswahl- und Datumsfelder loesen aus; ein Textfeld wuerde bei
        // jedem Tastendruck abschicken.
        const ziel = event.target as HTMLElement;
        if (ziel instanceof HTMLSelectElement || (ziel instanceof HTMLInputElement && ziel.type === "date")) {
          ref.current?.requestSubmit();
        }
      }}
    >
      {children}
    </form>
  );
}

/**
 * Schwebende Leiste fuer die Sammelaktion.
 *
 * Den Auswahlzustand haelt die Tabelle selbst - eine Render-Funktion liesse
 * sich nicht ueber die Server-Client-Grenze reichen, und ein zweiter Zustand
 * an dieser Stelle waere ohnehin einer zu viel. Abgeschickt wird eine
 * gewoehnliche Server Action mit mehreren Werten unter demselben Namen.
 */
export function SammelLeiste({
  gewaehlt,
  action,
  aktionen,
  aufAbbrechen,
}: {
  gewaehlt: string[];
  action: (formData: FormData) => void | Promise<void>;
  aktionen: { wert: string; beschriftung: string; gefaehrlich?: boolean }[];
  aufAbbrechen: () => void;
}) {
  if (gewaehlt.length === 0) return null;

  return (
    // Sie schwebt ueber dem Inhalt wie die Navigation - deshalb dasselbe Material.
    <form
      action={action}
      className="glas feder fixed inset-x-4 bottom-4 z-30 mx-auto flex max-w-2xl flex-wrap items-center gap-2 rounded-full px-4 py-2 md:bottom-6"
    >
      {gewaehlt.map((id) => (
        <input key={id} type="hidden" name="auswahl" value={id} />
      ))}
      <span className="text-sm font-medium text-slate-900">{gewaehlt.length} ausgewählt</span>
      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        {aktionen.map((a) => (
          <button
            key={a.wert}
            type="submit"
            name="was"
            value={a.wert}
            className={
              a.gefaehrlich
                ? "h-8 rounded-full px-3 text-sm font-medium text-rose-700 ring-1 ring-rose-300 transition-colors hover:bg-rose-50"
                : "h-8 rounded-full px-3 text-sm font-medium text-slate-800 ring-1 ring-slate-300 transition-colors hover:bg-slate-100"
            }
          >
            {a.beschriftung}
          </button>
        ))}
        <button
          type="button"
          onClick={aufAbbrechen}
          className="h-8 rounded-full px-3 text-sm text-slate-600 transition-colors hover:bg-slate-100"
        >
          Abbrechen
        </button>
      </div>
    </form>
  );
}
