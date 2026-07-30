/** Rahmenloses Layout fuer das Outlook-Taskpane (schmale Spalte, kein Menue). */
export default function AddinLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-white p-3">{children}</div>;
}
