"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CircleDollarSign, Settings, LogOut } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { signOut } from "@/lib/supabase/auth";

export default function AccountPage() {
  const router = useRouter();
  const [error, setError] = useState("");

  async function handleSignOut() {
    try {
      await signOut();
      router.replace("/login");
    } catch {
      setError("No se pudo cerrar la sesión. Inténtalo de nuevo.");
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-xl">
        <h1 className="text-3xl font-black tracking-[-0.04em]">Cuenta</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Accesos y sesión de Rapipan.</p>
        <div className="card mt-6 overflow-hidden p-2">
          <Link href="/creditos" className="flex min-h-14 items-center gap-3 rounded-xl px-4 text-sm font-bold hover:bg-[var(--green-soft)]">
            <CircleDollarSign aria-hidden="true" size={20} /> Créditos
          </Link>
          <Link href="/configuracion" className="flex min-h-14 items-center gap-3 rounded-xl px-4 text-sm font-bold hover:bg-[var(--green-soft)]">
            <Settings aria-hidden="true" size={20} /> Configuración
          </Link>
          <button type="button" onClick={handleSignOut} className="flex min-h-14 w-full items-center gap-3 rounded-xl px-4 text-left text-sm font-bold text-[#a33424] hover:bg-[#fff0ed]">
            <LogOut aria-hidden="true" size={20} /> Cerrar sesión
          </button>
        </div>
        {error && <p role="alert" className="mt-4 text-sm text-[#a33424]">{error}</p>}
      </div>
    </AppShell>
  );
}
