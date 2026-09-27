"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, LoaderCircle } from "lucide-react";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { getBusinessContext } from "@/lib/supabase/queries/business";

type AuthState = "checking" | "ready" | "unassigned" | "error";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<AuthState>("checking");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let active = true;

    async function verify() {
      try {
        const user = await getAuthenticatedUser();
        if (!active) return;
        if (!user) {
          router.replace("/login");
          return;
        }
        await getBusinessContext(user.id);
        if (active) setState("ready");
      } catch (error) {
        if (!active) return;
        const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
        if (code === "PGRST116") {
          setState("unassigned");
          return;
        }
        setMessage(error instanceof Error ? error.message : "No se pudo verificar la sesión.");
        setState("error");
      }
    }

    void verify();
    const { data } = getSupabaseClient().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        router.replace("/login");
      } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        void verify();
      }
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [router]);

  if (!isSupabaseConfigured) {
    return <GateMessage title="Configura Supabase" description="Añade las variables de .env.example a .env.local para habilitar el acceso privado." />;
  }
  if (state === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 text-sm font-semibold text-[var(--muted)]" role="status">
        <LoaderCircle className="animate-spin" size={20} aria-hidden="true" /> Verificando acceso…
      </div>
    );
  }
  if (state === "unassigned") {
    return <GateMessage title="Cuenta sin negocio" description="Tu usuario existe, pero todavía no tiene un perfil asociado a Rapipan. Revisa el paso de vinculación en el README." />;
  }
  if (state === "error") {
    return <GateMessage title="No se pudo abrir Rapipan" description={message} />;
  }
  return <>{children}</>;
}

function GateMessage({ title, description }: { title: string; description: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-5">
      <div className="card w-full max-w-md p-7 text-center">
        <AlertCircle className="mx-auto text-[var(--orange)]" size={30} aria-hidden="true" />
        <h1 className="mt-4 text-2xl font-black">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{description}</p>
      </div>
    </main>
  );
}
