"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertCircle, ArrowRight, CalendarDays, Lightbulb, LoaderCircle, Plus, UserRound } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { todayInLima } from "@/lib/dates/lima";
import { buildDashboard, comparableChange, type ClosureFacts } from "@/lib/dashboard/metrics";
import { formatMoney } from "@/lib/format/money";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { getBusinessContext } from "@/lib/supabase/queries/business";
import { getDashboardData } from "@/lib/supabase/queries/dashboard";
import { KpiCard } from "./kpi-card";
import { SalesChart } from "./sales-chart";

type DashboardData = { facts: ClosureFacts[]; latestRecordedDate: string | null; today: string };

function displayDate(date: string) {
  const formatted = new Intl.DateTimeFormat("es-PE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const today = todayInLima();
        const user = await getAuthenticatedUser();
        if (!user) throw new Error("Inicia sesión para consultar el dashboard.");
        const { business } = await getBusinessContext(user.id);
        const dashboard = await getDashboardData(business.id, today);
        if (active) setData({ ...dashboard, today });
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "No se pudo cargar el dashboard.");
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  if (error) return <div className="card flex items-start gap-3 p-6 text-sm text-red-700" role="alert"><AlertCircle size={20} />{error}</div>;
  if (!data) return <div className="flex min-h-64 items-center justify-center gap-3 text-sm font-semibold text-[var(--muted)]" role="status"><LoaderCircle className="animate-spin" size={20} /> Cargando dashboard…</div>;
  return <DashboardContent {...data} />;
}

export function DashboardContent({ facts, latestRecordedDate, today, preview = false }: DashboardData & { preview?: boolean }) {
  const report = buildDashboard(facts, today);
  const todayClosure = report.todayClosure;
  const previousDay = report.sameWeekdayLastWeek;
  const dailyChange = (current: number, previous: number) => todayClosure && previousDay ? comparableChange(current, previous) : null;
  const ownerShares = todayClosure?.ownerProfitSharesCents ?? [];
  const ownerValue = ownerShares.length > 0 ? ownerShares.length === 2 && ownerShares[0] === ownerShares[1] ? formatMoney(ownerShares[0]) : ownerShares.map(formatMoney).join(" / ") : "—";
  const metrics = [
    { key: "sales" as const, label: "Ventas", value: todayClosure ? formatMoney(todayClosure.salesCents) : "—", comparison: dailyChange(todayClosure?.salesCents ?? 0, previousDay?.salesCents ?? 0), tone: "green" as const },
    { key: "units" as const, label: preview ? "Unidades vendidas" : "Panes vendidos", value: todayClosure ? String(todayClosure.soldQuantity) : "—", comparison: dailyChange(todayClosure?.soldQuantity ?? 0, previousDay?.soldQuantity ?? 0), tone: "lime" as const },
    { key: "profit" as const, label: "Utilidad", value: todayClosure ? formatMoney(todayClosure.profitCents) : "—", comparison: dailyChange(todayClosure?.profitCents ?? 0, previousDay?.profitCents ?? 0), tone: "orange" as const },
    { key: "owner" as const, label: "Ganancia por socio", value: ownerValue, comparison: null, tone: "lavender" as const },
  ];
  const weekly = report.currentSummary;
  const previous = report.previousSummary;
  const weeklyRows = [
    { label: "Ventas", current: weekly.salesCents, previous: previous.salesCents, display: formatMoney(weekly.salesCents) },
    { label: "Utilidad", current: weekly.profitCents, previous: previous.profitCents, display: formatMoney(weekly.profitCents) },
    { label: preview ? "Unidades vendidas" : "Panes vendidos", current: weekly.soldQuantity, previous: previous.soldQuantity, display: String(weekly.soldQuantity) },
  ];

  return <div>
    <header className="mb-6 flex items-center justify-between lg:mb-8"><div className="lg:hidden"><Brand preview={preview} /></div>{!preview && <Link href="/cuenta" aria-label="Abrir cuenta" className="ml-auto flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-semibold text-[var(--muted)] shadow-sm lg:hidden"><UserRound aria-hidden="true" size={16} /></Link>}</header>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div>{preview && <span className="mb-3 inline-block rounded-full bg-[var(--orange-soft)] px-3 py-1 text-[0.68rem] font-bold uppercase tracking-wide text-[#8c591c]">Demostración · datos ficticios</span>}<h1 className="text-[2rem] font-black leading-none tracking-[-0.055em] text-[#301519] sm:text-[2.6rem]">¡Buenas!</h1><p className="mt-2 text-sm text-[var(--muted)] sm:text-base">Aquí tienes el resumen de hoy.</p></div><div className="flex w-fit items-center gap-2 rounded-2xl bg-white px-4 py-3 text-xs font-semibold text-[#45526a] shadow-sm sm:text-sm"><CalendarDays aria-hidden="true" size={18} className="text-[var(--green)]" />{displayDate(today)}</div></div>

    {!todayClosure && <div className="mt-6 rounded-2xl border border-[var(--border)] bg-white p-4 text-sm text-[var(--muted)]" role="status"><strong className="text-[var(--text)]">{latestRecordedDate ? "Hoy aún no tiene cierre." : "Todavía no hay cierres registrados."}</strong> {latestRecordedDate ? `El último día registrado fue ${displayDate(latestRecordedDate)}. Los indicadores de hoy se dejan vacíos, no en cero.` : "Registra el primer día para empezar a ver tus resultados."}</div>}
    <section className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Indicadores de hoy">{metrics.map((metric) => <KpiCard key={metric.key} metric={metric} />)}</section>

    <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.75fr)_minmax(17rem,0.75fr)]"><SalesChart days={facts} today={today} /><section className="card p-5 sm:p-6"><div className="flex items-center gap-2.5"><span className="grid size-9 place-items-center rounded-xl bg-[var(--green-soft)] text-[var(--green-dark)]"><CalendarDays aria-hidden="true" size={19} /></span><h2 className="text-lg font-extrabold tracking-[-0.025em]">Resumen semanal</h2></div><p className="mt-2 text-xs text-[var(--muted)]">Semana actual hasta hoy · {weekly.operatedDays} {weekly.operatedDays === 1 ? "día operado" : "días operados"}</p>{weekly.operatedDays === 0 ? <p className="mt-6 rounded-xl bg-[var(--surface-muted)] p-4 text-sm text-[var(--muted)]">No hay días operados esta semana. Una fecha sin registro no suma ventas ni cuenta como día operado.</p> : <dl className="mt-4 divide-y divide-[var(--border)]">{[["Ventas", formatMoney(weekly.salesCents)], ["Utilidad", formatMoney(weekly.profitCents)], [preview ? "Unidades vendidas" : "Panes vendidos", String(weekly.soldQuantity)], ["Margen", weekly.marginBps === null ? "—" : `${(weekly.marginBps / 100).toFixed(1)}%`]].map(([label, value]) => <div key={label} className="flex items-center justify-between gap-5 py-3"><dt className="text-sm text-[var(--muted)]">{label}</dt><dd className="text-base font-black tracking-[-0.02em]">{value}</dd></div>)}</dl>}
      <div className="mt-5 border-t border-[var(--border)] pt-4"><h3 className="text-sm font-extrabold">Semana actual vs anterior</h3><p className="mt-1 text-xs leading-5 text-[var(--muted)]">Mismos días de la semana, hasta hoy. {report.weeksComparable ? "Periodos comparables." : "Sin comparación: faltan días equivalentes operados en ambos periodos."}</p><div className="mt-3 space-y-2">{weeklyRows.map((row) => { const change = report.weeksComparable ? comparableChange(row.current, row.previous) : null; return <div key={row.label} className="flex items-center justify-between gap-2 text-xs"><span className="text-[var(--muted)]">{row.label}</span><span className="font-bold">{weekly.operatedDays > 0 ? row.display : "—"}</span><span className={`min-w-16 text-right font-bold ${change === null ? "text-[var(--muted)]" : change >= 0 ? "text-[var(--green-dark)]" : "text-[#b05a31]"}`}>{change === null ? "—" : `${change > 0 ? "+" : ""}${change.toFixed(1)}%`}</span></div>; })}</div></div>
    </section></div>

    <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]"><section className="card overflow-hidden bg-[linear-gradient(135deg,#fffaf2,#fff1df)] p-5 sm:p-6"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-[var(--orange)] text-white shadow-sm"><Lightbulb aria-hidden="true" size={20} /></span><div><h2 className="text-xl font-black tracking-[-0.035em]">¿Cómo vamos?</h2><p className="mt-0.5 text-xs text-[var(--muted)]">Conclusiones calculadas con días registrados</p></div></div>{report.insights.length === 0 ? <p className="mt-5 text-sm leading-6 text-[#475269]">Aún no hay datos suficientes para una conclusión útil esta semana.</p> : <ol className="mt-5 space-y-3">{report.insights.map((insight, index) => <li key={insight} className="flex items-start gap-3 text-sm leading-6 text-[#475269]"><span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-[var(--green)] text-xs font-bold text-white">{index + 1}</span>{insight}</li>)}</ol>}</section>
      <Link href={preview ? "/vista-previa/registrar" : "/registrar"} className="group relative flex min-h-56 overflow-hidden rounded-[1.25rem] bg-[linear-gradient(135deg,#24b574,#15955d)] p-6 text-white shadow-[0_18px_40px_rgba(32,166,106,0.22)] transition-transform hover:-translate-y-0.5"><div className="relative z-10 flex w-full flex-col"><span className="grid size-12 place-items-center rounded-full bg-white/18 backdrop-blur-sm"><Plus aria-hidden="true" size={28} strokeWidth={2.4} /></span><h2 className="mt-5 text-2xl font-black tracking-[-0.04em]">Registrar día</h2><p className="mt-2 max-w-sm text-sm leading-6 text-white/82">Agrega ventas, {preview ? "productos" : "panes"} no vendidos y el pago del reparto.</p><span className="mt-auto flex items-center justify-between pt-5 text-sm font-bold">Comenzar cierre <i className="grid size-10 place-items-center rounded-full bg-white text-[var(--green-dark)] transition-transform group-hover:translate-x-1"><ArrowRight aria-hidden="true" size={20} /></i></span></div><span aria-hidden="true" className="absolute -bottom-16 -right-14 size-48 rounded-full bg-white/10" /></Link>
    </div>
  </div>;
}
