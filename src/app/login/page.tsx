"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LoaderCircle, LockKeyhole } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { signInWithPassword } from "@/lib/supabase/auth";
import { isSupabaseConfigured } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await signInWithPassword(email.trim(), password);
      router.replace("/");
    } catch {
      setError("No pudimos iniciar sesión. Revisa el correo y la contraseña.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-5">
      <section className="card w-full max-w-md p-7 sm:p-9" aria-labelledby="login-title">
        <Brand />
        <div className="mt-9">
          <span className="grid size-12 place-items-center rounded-2xl bg-[var(--green-soft)] text-[var(--green-dark)]">
            <LockKeyhole aria-hidden="true" size={22} />
          </span>
          <h1 id="login-title" className="mt-5 text-3xl font-black tracking-[-0.045em]">Bienvenido de nuevo</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">Entra para administrar Rapipan.</p>
        </div>

        {!isSupabaseConfigured ? (
          <p className="mt-7 rounded-xl bg-[var(--orange-soft)] p-4 text-sm leading-6 text-[#704915]" role="status">
            Configura las variables de Supabase en <code>.env.local</code> para habilitar el acceso.
          </p>
        ) : (
          <form className="mt-7 space-y-5" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email" className="block text-sm font-bold">Correo electrónico</label>
              <input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)}
                className="mt-2 min-h-12 w-full rounded-xl border border-[var(--border)] bg-white px-4 text-sm outline-none focus:border-[var(--green)] focus:ring-4 focus:ring-[var(--green-soft)]" />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-bold">Contraseña</label>
              <div className="relative mt-2">
                <input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)}
                  className="min-h-12 w-full rounded-xl border border-[var(--border)] bg-white py-3 pl-4 pr-12 text-sm outline-none focus:border-[var(--green)] focus:ring-4 focus:ring-[var(--green-soft)]" />
                <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  className="absolute inset-y-0 right-0 grid min-w-12 place-items-center text-[var(--muted)] hover:text-[var(--text)]">
                  {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                </button>
              </div>
            </div>
            {error && <p role="alert" className="rounded-xl bg-[#fff0ed] p-3 text-sm text-[#a33424]">{error}</p>}
            <button type="submit" disabled={submitting} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--green)] px-5 text-sm font-bold text-white hover:bg-[var(--green-dark)] disabled:cursor-wait disabled:opacity-70">
              {submitting && <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />}
              {submitting ? "Entrando…" : "Entrar"}
            </button>
          </form>
        )}
        <p className="mt-6 text-center text-xs text-[var(--muted)]">Acceso privado para el equipo de Rapipan.</p>
      </section>
    </main>
  );
}
