"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { THEMES, THEME_STORAGE_KEY, isTheme, type Theme } from "@/lib/theme";

const LABEL: Record<Theme, string> = {
  system: "System",
  hell: "Hell",
  dunkel: "Dunkel",
};

const ICON: Record<Theme, string> = {
  system: "◐",
  hell: "☀",
  dunkel: "☾",
};

/** Ob bei "System" gerade dunkel gilt. */
function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function apply(theme: Theme) {
  const dark = theme === "dunkel" || (theme === "system" && systemPrefersDark());
  document.documentElement.classList.toggle("dark", dark);
}

/**
 * Schaltet System → Hell → Dunkel im Kreis. Die Auswahl liegt im
 * localStorage, nicht am Server: sie haengt am Geraet, nicht an den Daten, und
 * die App kennt keine Anmeldung, an der eine Einstellung sonst haengen koennte.
 */
export function ThemeToggle({ className }: { className?: string }) {
  // Erster Render muss zum Server-HTML passen, sonst meckert die Hydration.
  // Das Inline-Skript im Root-Layout hat die Klasse da laengst gesetzt.
  const [theme, setTheme] = React.useState<Theme>("system");
  const [bereit, setBereit] = React.useState(false);

  React.useEffect(() => {
    const gespeichert = localStorage.getItem(THEME_STORAGE_KEY);
    setTheme(isTheme(gespeichert) ? gespeichert : "system");
    setBereit(true);
  }, []);

  // Bei "System" auf einen Wechsel der Systemeinstellung reagieren.
  React.useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const beiWechsel = () => apply("system");
    mq.addEventListener("change", beiWechsel);
    return () => mq.removeEventListener("change", beiWechsel);
  }, [theme]);

  function weiterschalten() {
    const naechstes = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    setTheme(naechstes);
    localStorage.setItem(THEME_STORAGE_KEY, naechstes);
    apply(naechstes);
  }

  return (
    <button
      type="button"
      onClick={weiterschalten}
      title={`Farbschema: ${LABEL[theme]} – klicken zum Wechseln`}
      aria-label={`Farbschema: ${LABEL[theme]}. Klicken wechselt zu ${
        LABEL[THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]]
      }.`}
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-200/60 hover:text-slate-900",
        className,
      )}
    >
      <span aria-hidden className="text-base leading-none">
        {ICON[theme]}
      </span>
      {/* Vor dem Auslesen des Speichers bleibt die Beschriftung leer, damit
          nicht kurz "System" steht, wo "Dunkel" hingehoert. */}
      <span className={cn(!bereit && "opacity-0")}>{LABEL[theme]}</span>
    </button>
  );
}
