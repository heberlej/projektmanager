"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

type Treffer = {
  art: "PROJEKT" | "NOTIZ" | "AUFGABE" | "MAIL" | "DATEI";
  id: string;
  titel: string;
  href: string;
  archiviert: boolean;
};

const ART_LABEL: Record<Treffer["art"], string> = {
  PROJEKT: "Projekt",
  NOTIZ: "Notiz",
  AUFGABE: "Aufgabe",
  MAIL: "Mail",
  DATEI: "Datei",
};

/**
 * Sprungfenster auf Strg+K bzw. Cmd+K.
 *
 * Es sucht ueber dieselbe Fachlogik wie die Suchseite, nur ohne Umweg: tippen,
 * mit den Pfeiltasten waehlen, Eingabetaste. Fuer jemanden, der den ganzen Tag
 * in der App ist, ist das der kuerzeste Weg zu einem Projekt.
 */
export function Sprungfenster() {
  const router = useRouter();
  const [offen, setOffen] = useState(false);
  const [begriff, setBegriff] = useState("");
  const [treffer, setTreffer] = useState<Treffer[]>([]);
  const [aktiv, setAktiv] = useState(0);
  const [laeuft, setLaeuft] = useState(false);
  const feldRef = useRef<HTMLInputElement>(null);

  // Oeffnen und schliessen
  useEffect(() => {
    function beiTaste(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOffen((vorher) => !vorher);
      }
      if (event.key === "Escape") setOffen(false);
    }
    window.addEventListener("keydown", beiTaste);
    return () => window.removeEventListener("keydown", beiTaste);
  }, []);

  useEffect(() => {
    if (offen) {
      feldRef.current?.focus();
    } else {
      setBegriff("");
      setTreffer([]);
      setAktiv(0);
    }
  }, [offen]);

  // Suchen, entprellt - sonst eine Abfrage je Tastendruck.
  useEffect(() => {
    if (!offen) return;
    const wert = begriff.trim();
    if (wert.length < 2) {
      setTreffer([]);
      return;
    }
    const abbruch = new AbortController();
    setLaeuft(true);
    const timer = setTimeout(async () => {
      try {
        const antwort = await fetch(`/api/suche?q=${encodeURIComponent(wert)}`, {
          signal: abbruch.signal,
        });
        const daten = await antwort.json();
        setTreffer(daten.treffer ?? []);
        setAktiv(0);
      } catch {
        // Abgebrochene Anfrage ist kein Fehler, der jemanden interessiert.
      } finally {
        setLaeuft(false);
      }
    }, 180);

    return () => {
      clearTimeout(timer);
      abbruch.abort();
    };
  }, [begriff, offen]);

  const springen = useCallback(
    (ziel: Treffer | undefined) => {
      if (!ziel) return;
      setOffen(false);
      router.push(ziel.href);
    },
    [router],
  );

  if (!offen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sprungfenster"
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/25 p-4 pt-[12vh]"
      onClick={(event) => {
        if (event.target === event.currentTarget) setOffen(false);
      }}
    >
      <div className="glas feder w-full max-w-xl overflow-hidden rounded-2xl">
        <input
          ref={feldRef}
          value={begriff}
          onChange={(event) => setBegriff(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setAktiv((i) => Math.min(i + 1, treffer.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setAktiv((i) => Math.max(i - 1, 0));
            } else if (event.key === "Enter") {
              event.preventDefault();
              springen(treffer[aktiv]);
            }
          }}
          placeholder="Springen zu … (Projekt, Aufgabe, Mail, Datei)"
          aria-label="Suchbegriff"
          className="w-full bg-transparent px-4 py-3.5 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none"
        />

        {begriff.trim().length >= 2 ? (
          <div className="max-h-80 overflow-y-auto border-t border-slate-200">
            {treffer.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">
                {laeuft ? "sucht …" : "Nichts gefunden"}
              </p>
            ) : (
              <ul role="listbox">
                {treffer.map((t, i) => (
                  <li key={`${t.art}-${t.id}`}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={i === aktiv}
                      onMouseEnter={() => setAktiv(i)}
                      onClick={() => springen(t)}
                      className={cn(
                        "flex w-full items-center gap-2 px-4 py-2 text-left text-sm",
                        i === aktiv ? "bg-slate-100" : "hover:bg-slate-50",
                      )}
                    >
                      <span className="w-14 shrink-0 text-xs text-slate-500">
                        {ART_LABEL[t.art]}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-slate-900">{t.titel}</span>
                      {t.archiviert ? (
                        <span className="shrink-0 text-xs text-slate-500">archiviert</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
            Mindestens zwei Zeichen. Pfeiltasten wählen, Eingabetaste springt,
            Esc schließt.
          </p>
        )}
      </div>
    </div>
  );
}
