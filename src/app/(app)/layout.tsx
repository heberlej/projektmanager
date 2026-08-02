import Link from "next/link";
import { NavLink } from "@/components/nav-link";
import { ThemeToggle } from "@/components/theme-toggle";
import { Sprungfenster } from "@/components/sprungfenster";
import { istDesktop } from "@/lib/addin-einrichtung";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* Bedienebene: die Navigation liegt als Glas neben dem Inhalt, klebend,
          damit beim Scrollen tatsaechlich etwas darunter durchlaeuft. */}
      <aside className="glas sticky top-0 hidden h-screen w-56 shrink-0 flex-col rounded-none border-y-0 border-l-0 p-3 md:flex">
        <Link href="/" className="mb-4 block px-3 py-2">
          <span className="text-sm font-semibold text-slate-900">Projektmanager</span>
        </Link>
        <nav className="space-y-1">
          <NavLink href="/" icon="◎">
            Dashboard
          </NavLink>
          <NavLink href="/projekte" icon="▦">
            Projekte
          </NavLink>
          <NavLink href="/aufgaben" icon="☑">
            Aufgaben
          </NavLink>
          <NavLink href="/kalender" icon="▣">
            Kalender
          </NavLink>
          <NavLink href="/vorlagen" icon="▤">
            Vorlagen
          </NavLink>
          <NavLink href="/suche" icon="⌕">
            Suche
          </NavLink>
          <NavLink href="/papierkorb" icon="⌫">
            Papierkorb
          </NavLink>
          {/* Nur in der Windows-Fassung: dort richtet die Seite das Add-in ein.
              Im Docker-Betrieb steht der Weg dorthin in der README. */}
          {istDesktop() ? (
            <NavLink href="/einstellungen" icon="⚙">
              Einstellungen
            </NavLink>
          ) : null}
        </nav>
        <div className="mt-6 px-3">
          <Link
            href="/projekte/neu"
            className="flex h-9 items-center justify-center rounded-full bg-akzent px-3 text-sm font-medium text-akzent-auf hover:bg-akzent-stark"
          >
            Neues Projekt
          </Link>
        </div>

        <div className="mt-auto pt-4">
          <ThemeToggle className="w-full" />
        </div>
      </aside>

      {/* Auf schmalen Breiten unten statt seitlich: eine schwebende Kapsel,
          unter der der Inhalt durchlaeuft - dort wirkt das Material. */}
      <div className="glas fixed inset-x-3 bottom-3 z-20 flex justify-around rounded-full p-1 md:hidden">
        <NavLink href="/" icon="◎">
          Start
        </NavLink>
        <NavLink href="/projekte" icon="▦">
          Projekte
        </NavLink>
        <NavLink href="/aufgaben" icon="☑">
          Aufgaben
        </NavLink>
        <NavLink href="/kalender" icon="▣">
          Kalender
        </NavLink>
        {/* Auf schmalen Breiten nur das Zeichen, sonst wird die Leiste zu eng. */}
        <ThemeToggle className="px-2 [&>span:last-child]:hidden" />
      </div>

      <main className="min-w-0 flex-1 px-4 pt-6 pb-20 md:px-8 md:pb-8">{children}</main>

      {/* Liegt ausserhalb des Inhalts: das Fenster gehoert zur Bedienebene. */}
      <Sprungfenster />
    </div>
  );
}
