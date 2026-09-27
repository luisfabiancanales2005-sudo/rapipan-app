"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChartNoAxesCombined,
  CircleDollarSign,
  History,
  Home,
  NotebookPen,
  Settings,
  UserRound,
} from "lucide-react";
import { Brand } from "./brand";

const desktopItems = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/registrar", label: "Registrar día", icon: NotebookPen },
  { href: "/historial", label: "Historial", icon: History },
  { href: "/creditos", label: "Créditos", icon: CircleDollarSign },
  { href: "/reportes", label: "Reportes", icon: ChartNoAxesCombined },
  { href: "/configuracion", label: "Configuración", icon: Settings },
] as const;

const mobileItems = desktopItems.filter(({ href }) =>
  ["/", "/registrar", "/historial", "/reportes"].includes(href),
);

function isCurrent(pathname: string, href: string) {
  return href === "/" ? pathname === href : pathname.startsWith(href);
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen border-r border-[var(--border)] bg-[rgba(255,255,255,0.72)] px-5 py-8 backdrop-blur-xl lg:flex lg:flex-col">
      <div className="px-3">
        <Brand />
      </div>
      <nav className="mt-11 space-y-2" aria-label="Navegación principal">
        {desktopItems.map(({ href, label, icon: Icon }) => {
          const active = isCurrent(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-12 items-center gap-3 rounded-2xl px-4 text-[0.94rem] font-semibold transition-colors ${
                active
                  ? "bg-[var(--green)] text-white shadow-[0_10px_24px_rgba(32,166,106,0.2)]"
                  : "text-[#415069] hover:bg-white hover:text-[var(--green-dark)]"
              }`}
            >
              <Icon aria-hidden="true" size={20} strokeWidth={2.1} />
              {label}
            </Link>
          );
        })}
      </nav>
      <Link href="/cuenta" className="mt-7 flex min-h-11 items-center gap-3 rounded-2xl px-4 text-sm font-semibold text-[#415069] hover:bg-white hover:text-[var(--green-dark)]">
        <UserRound aria-hidden="true" size={19} /> Cuenta
      </Link>
      <div className="mt-auto rounded-[1.4rem] bg-[var(--orange-soft)] p-4 text-sm leading-6 text-[#7b5222]">
        <span className="block font-bold text-[#6b4215]">Cierre rápido</span>
        Registra el día y confirma que todos los panes cuadren.
      </div>
    </aside>
  );
}

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-50 grid grid-cols-4 rounded-[1.35rem] border border-white/80 bg-white/95 px-1 py-2 shadow-[0_16px_46px_rgba(23,36,58,0.16)] backdrop-blur-xl lg:hidden"
      aria-label="Navegación móvil"
    >
      {mobileItems.map(({ href, label, icon: Icon }) => {
        const active = isCurrent(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[0.66rem] font-semibold transition-colors ${
              active ? "bg-[var(--green-soft)] text-[var(--green-dark)]" : "text-[var(--muted)]"
            }`}
          >
            <Icon aria-hidden="true" size={20} strokeWidth={active ? 2.5 : 1.9} />
            {label === "Registrar día" ? "Registrar" : label}
          </Link>
        );
      })}
    </nav>
  );
}
