"use client";

import { useEffect, useState, type FormEvent } from "react";
import { LoaderCircle, LockKeyhole } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { getSupabaseClient } from "@/lib/supabase/client";

export function InviteSetup({ onComplete }: { onComplete: () => void }) {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getSupabaseClient().auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError || !data.session) {
        setError("La invitación no es válida o ha vencido. Solicita una nueva invitación.");
        return;
      }
      setReady(true);
    }).catch(() => {
      if (active) setError("No pudimos verificar la invitación. Inténtalo de nuevo.");
    });
    return () => { active = false; };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Usa una contraseña de al menos 8 caracteres.");
      return;
    }
    if (password !== confirmation) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setSubmitting(true);
    try {
      const { error: updateError } = await getSupabaseClient().auth.updateUser({ password });
      if (updateError) throw updateError;
      window.history.replaceState(null, "", window.location.pathname);
      onComplete();
    } catch {
      setError("No pudimos guardar la contraseña. Vuelve a intentarlo.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-5">
      <section className="card w-full max-w-md p-7 sm:p-9" aria-labelledby="invite-title">
        <Brand />
        <span className="mt-9 grid size-12 place-items-center rounded-2xl bg-[var(--green-soft)] text-[var(--green-dark)]">
          <LockKeyhole aria-hidden="true" size={22} />
        </span>
        <h1 id="invite-title" className="mt-5 text-3xl font-black tracking-[-0.045em]">Activa tu acceso</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Elige una contraseña para entrar a Rapipan. No la compartas con nadie.</p>
        {!ready && !error && <p className="mt-7 flex items-center gap-2 text-sm text-[var(--muted)]" role="status"><LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> Verificando invitación…</p>}
        {ready && (
          <form className="mt-7 space-y-5" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="new-password" className="block text-sm font-bold">Nueva contraseña</label>
              <input id="new-password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)}
                className="mt-2 min-h-12 w-full rounded-xl border border-[var(--border)] bg-white px-4 text-sm outline-none focus:border-[var(--green)] focus:ring-4 focus:ring-[var(--green-soft)]" />
            </div>
            <div>
              <label htmlFor="confirm-password" className="block text-sm font-bold">Repite la contraseña</label>
              <input id="confirm-password" type="password" autoComplete="new-password" required minLength={8} value={confirmation} onChange={(event) => setConfirmation(event.target.value)}
                className="mt-2 min-h-12 w-full rounded-xl border border-[var(--border)] bg-white px-4 text-sm outline-none focus:border-[var(--green)] focus:ring-4 focus:ring-[var(--green-soft)]" />
            </div>
            <button type="submit" disabled={submitting} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--green)] px-5 text-sm font-bold text-white hover:bg-[var(--green-dark)] disabled:cursor-wait disabled:opacity-70">
              {submitting && <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />}
              {submitting ? "Guardando…" : "Activar cuenta"}
            </button>
          </form>
        )}
        {error && <p role="alert" className="mt-5 rounded-xl bg-[#fff0ed] p-3 text-sm text-[#a33424]">{error}</p>}
      </section>
    </main>
  );
}
