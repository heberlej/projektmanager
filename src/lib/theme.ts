/**
 * Farbschema. Geteilt zwischen dem Inline-Skript im Root-Layout und dem
 * Umschalter, damit Schluessel und erlaubte Werte nur einmal dastehen.
 */

export const THEMES = ["system", "hell", "dunkel"] as const;

export type Theme = (typeof THEMES)[number];

export const THEME_STORAGE_KEY = "pm-theme";

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

/**
 * Laeuft als Inline-Skript im <head>, vor dem ersten Zeichnen. Ohne das blitzt
 * beim Laden das helle Schema auf, weil React erst spaeter uebernimmt.
 * Absichtlich in einen try-Block gepackt: im Outlook-Taskpane kann der Zugriff
 * auf localStorage geblockt sein, dann gilt eben die Systemeinstellung.
 */
export const THEME_INIT_SCRIPT = `
try {
  var gespeichert = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
  var dunkel =
    gespeichert === "dunkel" ||
    ((gespeichert === null || gespeichert === "system") &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dunkel);
} catch (e) {}
`.trim();
