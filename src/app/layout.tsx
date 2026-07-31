import type { Metadata } from "next";
import "./globals.css";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Projektmanager",
  description: "Projektverwaltung fuer IT-Projektarbeit",
};

/**
 * Nur Grundgeruest - die Navigation haengt in der Routengruppe (app), damit
 * das Outlook-Taskpane unter /addin ohne Rahmen auskommt.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: das Skript unten setzt die Klasse .dark am
    // <html>, bevor React uebernimmt - sonst ein Hydrationsfehler bei jedem
    // Laden im dunklen Schema.
    <html lang="de" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
