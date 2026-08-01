"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function NavLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={cn(
        // Kapselform wie in der neuen Systemgestaltung; die aktive Pille sitzt
        // als deckende Flaeche auf dem Glas, nicht als zweite Glasschicht.
        "flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-200/60",
      )}
    >
      <span aria-hidden className="text-base leading-none">
        {icon}
      </span>
      {children}
    </Link>
  );
}
