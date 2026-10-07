"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertCircle, ArrowRight, CalendarDays, ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";
import { formatMoney } from "@/lib/format/money";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { getBusinessContext } from "@/lib/supabase/queries/business";
import { getHistoryPage } from "@/lib/supabase/queries/history";

export type PageData = Awaited<ReturnType<typeof getHistoryPage>>;

function dateLabel(date: string) {
  return new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

export function HistoryPageContent() {
  const [page, setPage] = useState(0);
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const user = await getAuthenticatedUser();
        if (!user) throw new Error("Inicia sesión para ver el historial.");
        const { business } = await getBusinessContext(user.id);
        const result = await getHistoryPage(business.id, page);
        if (active) { setData(result); setError(""); }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "No se pudo cargar el historial.");
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [page]);

  return <HistoryView data={data} page={page} loading={loading} error={error} onPageChange={(next) => { setLoading(true); setPage(next); }} />;
}

export function HistoryView({ data, page = 0, loading = false, error = "", preview = false, onPageChange }: {
  data: PageData | null;
  page?: number;
  loading?: boolean;
  error?: string;
  preview?: boolean;
  onPageChange?: (page: number) => void;
}) {
  return <div>
    <header className="mb-6"><span className="inline-block rounded-full bg-[var(--green-soft)] px-3 py-1 text-[0.7rem] font-extrabold uppercase tracking-wide text-[var(--green-dark)]">Operación</span><h1 className="mt-3 text-3xl font-black tracking-tight">Historial</h1><p className="mt-1 text-sm text-[var(--muted)]">{preview ? "Ejemplos ficticios de cierres diarios." : "Los cierres nuevos aparecen aquí. Los días importados del Excel están en el archivo histórico."}</p>{!preview && <Link href="/archivo" className="mt-3 inline-flex min-h-9 items-center text-sm font-bold text-[var(--green-dark)]">Ver archivo histórico completo →</Link>}{preview && <p className="mt-2 text-xs font-bold text-[#8c591c]">Demostración con datos ficticios</p>}</header>
    {error && <div className="card flex items-start gap-3 p-5 text-sm text-red-700" role="alert"><AlertCircle size={20} />{error}</div>}
    {loading ? <div className="flex min-h-52 items-center justify-center gap-3 text-sm text-[var(--muted)]" role="status"><LoaderCircle className="animate-spin" size={19} /> Cargando cierres…</div> : data && data.items.length === 0 && page === 0 ? <div className="card p-8 text-center"><CalendarDays className="mx-auto text-[var(--green)]" size={34} /><h2 className="mt-4 text-xl font-black">Aún no hay cierres nuevos</h2><p className="mt-2 text-sm text-[var(--muted)]">Los días importados del Excel están disponibles en el archivo histórico. Registra un día nuevo para consultar aquí su liquidación.</p><Link href="/registrar" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--green)] px-5 text-sm font-bold text-white">Registrar día <ArrowRight size={17} /></Link></div> : data && <>
      <div className="card overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-[var(--surface-muted)] text-xs font-bold uppercase tracking-wide text-[var(--muted)]"><tr><th className="px-5 py-4">Fecha</th><th className="px-4 py-4 text-right">Comprados</th><th className="px-4 py-4 text-right">Vendidos</th><th className="px-4 py-4 text-right">Ventas</th><th className="px-4 py-4 text-right">Utilidad</th><th className="px-4 py-4 text-right">Margen</th><th className="px-4 py-4"><span className="sr-only">Detalle</span></th></tr></thead><tbody className="divide-y divide-[var(--border)]">{data.items.map((item) => <tr key={item.id} className="hover:bg-[var(--green-soft)]/50"><th scope="row" className="px-5 py-4 font-extrabold"><Link href={preview ? "/vista-previa/historial/detalle" : `/historial/detalle/?id=${item.id}`} className="inline-flex min-h-9 items-center text-[var(--text)] hover:text-[var(--green-dark)]">{dateLabel(item.date)}</Link></th><td className="px-4 py-4 text-right">{item.purchasedQuantity}</td><td className="px-4 py-4 text-right">{item.soldQuantity}</td><td className="px-4 py-4 text-right font-bold">{formatMoney(item.salesCents)}</td><td className="px-4 py-4 text-right font-bold">{formatMoney(item.profitCents)}</td><td className="px-4 py-4 text-right">{item.salesCents === 0 ? "—" : `${(item.profitCents / item.salesCents * 100).toFixed(1)}%`}</td><td className="px-4 py-4"><Link href={preview ? "/vista-previa/historial/detalle" : `/historial/detalle/?id=${item.id}`} className="inline-flex min-h-9 items-center gap-1 text-xs font-bold text-[var(--green-dark)]">Ver <ArrowRight size={14} /></Link></td></tr>)}</tbody></table></div>
      <div className="mt-4 flex items-center justify-between gap-4 text-sm"><p className="text-[var(--muted)]">Página {page + 1}</p><div className="flex gap-2"><button type="button" disabled={page === 0} onClick={() => onPageChange?.(page - 1)} className="flex min-h-11 items-center gap-1 rounded-xl border border-[var(--border)] bg-white px-3 font-bold disabled:opacity-40"><ChevronLeft size={17} /> Anterior</button><button type="button" disabled={!data.hasMore} onClick={() => onPageChange?.(page + 1)} className="flex min-h-11 items-center gap-1 rounded-xl border border-[var(--border)] bg-white px-3 font-bold disabled:opacity-40">Siguiente <ChevronRight size={17} /></button></div></div>
    </>}
  </div>;
}
