import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
