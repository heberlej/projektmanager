import Link from "next/link";
import { NavLink } from "@/components/nav-link";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-slate-200 bg-slate-100/70 p-3 md:flex">
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
        </nav>
        <div className="mt-6 px-3">
          <Link
            href="/projekte/neu"
            className="flex h-9 items-center justify-center rounded-md bg-akzent px-3 text-sm font-medium text-akzent-auf hover:bg-akzent-stark"
          >
            Neues Projekt
          </Link>
        </div>

        <div className="mt-auto pt-4">
          <ThemeToggle className="w-full" />
        </div>
      </aside>

      {/* Auf schmalen Breiten unten statt seitlich */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-slate-200 bg-white p-1 md:hidden">
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
    </div>
  );
}
