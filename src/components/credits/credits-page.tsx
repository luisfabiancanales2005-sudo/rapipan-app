"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, CreditCard, LoaderCircle } from "lucide-react";
import { todayInLima } from "@/lib/dates/lima";
import { groupCollectionsByDate } from "@/lib/finance/credit-flow";
import { formatMoney } from "@/lib/format/money";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { recordCreditPayment } from "@/lib/supabase/mutations/credits";
import { getBusinessContext } from "@/lib/supabase/queries/business";
import { getCreditLedger } from "@/lib/supabase/queries/credits";

export type CreditLedger = Awaited<ReturnType<typeof getCreditLedger>>;

function dateLabel(date: string) {
  return new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

export function CreditsPageContent() {
  const [ledger, setLedger] = useState<CreditLedger | null>(null);
  const [businessId, setBusinessId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState("");
  const [paymentDates, setPaymentDates] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const user = await getAuthenticatedUser();
        if (!user) throw new Error("Inicia sesión para consultar créditos.");
        const { business } = await getBusinessContext(user.id);
        const result = await getCreditLedger(business.id);
        if (active) { setBusinessId(business.id); setLedger(result); setError(""); }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "No se pudieron cargar los créditos.");
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, []);

  async function pay(creditId: string, saleDate: string) {
    const paymentDate = paymentDates[creditId] ?? todayInLima();
    if (paymentDate < saleDate || paymentDate > todayInLima()) {
      setError("La fecha de cobro debe estar entre la venta original y hoy.");
      return;
    }
    setPayingId(creditId);
    setError("");
    setMessage("");
    try {
      await recordCreditPayment(creditId, paymentDate);
      setLedger(await getCreditLedger(businessId));
      setMessage(`Cobro registrado el ${dateLabel(paymentDate)}. La venta original no se duplicó.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo registrar el cobro.");
    } finally { setPayingId(""); }
  }

  if (loading) return <div className="flex min-h-52 items-center justify-center gap-3 text-sm text-[var(--muted)]" role="status"><LoaderCircle className="animate-spin" size={19} /> Cargando créditos…</div>;
  return <CreditsView ledger={ledger ?? { items: [], payments: [] }} preview={false} error={error} message={message} payingId={payingId} paymentDates={paymentDates} onDateChange={(id, date) => setPaymentDates({ ...paymentDates, [id]: date })} onPay={pay} />;
}

export function CreditsView({ ledger, preview = false, error = "", message = "", payingId = "", paymentDates = {}, onDateChange, onPay }: {
  ledger: CreditLedger;
  preview?: boolean;
  error?: string;
  message?: string;
  payingId?: string;
  paymentDates?: Record<string, string>;
  onDateChange?: (id: string, date: string) => void;
  onPay?: (id: string, saleDate: string) => void;
}) {
  const [tab, setTab] = useState<"pending" | "paid">("pending");
  const pending = ledger.items.filter((item) => item.remainingCents > 0 && !item.collectionDateUnknown);
  const paid = ledger.items.filter((item) => item.remainingCents === 0 || item.collectionDateUnknown);
  const items = tab === "pending" ? pending : paid;
  const collections = groupCollectionsByDate(ledger.payments.map((payment) => ({ paymentDate: payment.payment_date, amountCents: payment.amount_cents })));
  const outstandingCents = pending.reduce((sum, item) => sum + item.remainingCents, 0);

  return <div>
    <header className="mb-6"><span className="inline-block rounded-full bg-[var(--lavender-soft)] px-3 py-1 text-[0.7rem] font-extrabold uppercase tracking-wide text-[#6652c4]">Caja y créditos</span><h1 className="mt-3 text-3xl font-black tracking-tight">Créditos</h1><p className="mt-1 text-sm text-[var(--muted)]">El cobro se registra en su fecha, sin repetir la venta original. {!preview && " Los cobros históricos del 16 y 18/09 usan la fecha 26/09/2026 asumida por indicación del negocio."}</p>{preview && <p className="mt-2 text-xs font-bold text-[#8c591c]">Demostración con datos ficticios; los botones no guardan.</p>}</header>
    {error && <p className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700" role="alert"><AlertCircle className="mr-2 inline" size={16} />{error}</p>}
    {message && <p className="mb-4 rounded-xl bg-[var(--green-soft)] p-4 text-sm text-[var(--green-dark)]" role="status"><CheckCircle2 className="mr-2 inline" size={16} />{message}</p>}
    <div className="mb-5 grid gap-3 sm:grid-cols-2"><div className="card p-5"><p className="text-xs font-bold text-[var(--muted)]">Saldo pendiente</p><p className="mt-2 text-3xl font-black text-[var(--text)]">{formatMoney(outstandingCents)}</p><p className="mt-1 text-xs text-[var(--muted)]">{pending.length} {pending.length === 1 ? "crédito pendiente" : "créditos pendientes"}</p></div><div className="card p-5"><p className="text-xs font-bold text-[var(--muted)]">Créditos cobrados</p><p className="mt-2 text-3xl font-black text-[var(--text)]">{paid.length}</p><p className="mt-1 text-xs text-[var(--muted)]">{preview ? "Según los ejemplos ficticios" : "Incluye cobros históricos con fecha asumida"}</p></div></div>
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(17rem,.7fr)]">
      <section className="card p-5 sm:p-6"><div className="flex gap-2 rounded-xl bg-[var(--surface-muted)] p-1" role="tablist" aria-label="Estado del crédito"><button type="button" role="tab" aria-selected={tab === "pending"} onClick={() => setTab("pending")} className={`min-h-10 flex-1 rounded-lg px-3 text-sm font-bold ${tab === "pending" ? "bg-white text-[var(--green-dark)] shadow-sm" : "text-[var(--muted)]"}`}>Pendientes ({pending.length})</button><button type="button" role="tab" aria-selected={tab === "paid"} onClick={() => setTab("paid")} className={`min-h-10 flex-1 rounded-lg px-3 text-sm font-bold ${tab === "paid" ? "bg-white text-[var(--green-dark)] shadow-sm" : "text-[var(--muted)]"}`}>Pagados ({paid.length})</button></div>
        {items.length === 0 ? <div className="py-12 text-center"><CreditCard className="mx-auto text-[var(--lavender)]" size={30} /><p className="mt-3 font-bold">{tab === "pending" ? "No hay créditos pendientes" : "Aún no hay créditos cobrados"}</p></div> : <ul className="mt-4 divide-y divide-[var(--border)]">{items.map((item) => <li key={item.id} className="py-4 first:pt-0"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-extrabold">{item.reference || "Sin referencia"}</p><p className="mt-1 text-xs text-[var(--muted)]">Venta: {dateLabel(item.saleDate)}{item.lastPaymentDate ? ` · Último cobro: ${dateLabel(item.lastPaymentDate)}${item.assumedPaymentDate ? " (fecha asumida)" : ""}` : ""}</p></div><div className="text-right"><p className="text-lg font-black">{formatMoney(item.amount_cents)}</p><p className="text-xs text-[var(--muted)]">{item.collectionDateUnknown ? "Cobrado; fecha no informada" : item.remainingCents > 0 ? `Saldo: ${formatMoney(item.remainingCents)}` : "Pagado"}</p></div></div>{item.remainingCents > 0 && !item.collectionDateUnknown && <div className="mt-4 flex flex-wrap items-end gap-3"><label className="grid gap-1 text-xs font-bold text-[var(--muted)]">Fecha de cobro<input type="date" min={item.saleDate} max={todayInLima()} value={paymentDates[item.id] ?? todayInLima()} onChange={(event) => onDateChange?.(item.id, event.target.value)} className="min-h-11 rounded-xl border border-[var(--border)] bg-white px-3 text-sm text-[var(--text)]" /></label><button type="button" onClick={() => onPay?.(item.id, item.saleDate)} disabled={preview || payingId === item.id} className="min-h-11 rounded-xl bg-[var(--green)] px-4 text-sm font-bold text-white disabled:opacity-45">{payingId === item.id ? "Registrando…" : "Marcar como cobrado"}</button></div>}</li>)}</ul>}
      </section>
      <aside className="card p-5 sm:p-6"><h2 className="text-lg font-extrabold">Cobros por fecha</h2><p className="mt-1 text-xs leading-5 text-[var(--muted)]">Flujo de caja, no ventas nuevas. {!preview && " Los cobros del Excel son referencia histórica: no crean una entrega de caja adicional en los cierres nuevos."}</p>{collections.length === 0 ? <p className="mt-5 text-sm text-[var(--muted)]">Aún no hay cobros registrados.</p> : <dl className="mt-4 divide-y divide-[var(--border)]">{collections.map(([date, amount]) => <div key={date} className="flex justify-between gap-3 py-3 text-sm"><dt className="text-[var(--muted)]">{dateLabel(date)}</dt><dd className="font-extrabold">{formatMoney(amount)}</dd></div>)}</dl>}</aside>
    </div>
  </div>;
}
