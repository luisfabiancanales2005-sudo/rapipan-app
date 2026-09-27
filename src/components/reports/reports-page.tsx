"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CalendarRange, LoaderCircle } from "lucide-react";
import { comparableChange, type ClosureFacts } from "@/lib/dashboard/metrics";
import { todayInLima } from "@/lib/dates/lima";
import { formatMoney } from "@/lib/format/money";
import { buildReport, resolveReportRange, summarizeCouriers, summarizeShifts, summarizeWeekdayShifts, type CourierReportRun, type ReportSelection, type ShiftFact } from "@/lib/reports/metrics";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { getBusinessContext } from "@/lib/supabase/queries/business";
import { getReportsData } from "@/lib/supabase/queries/reports";
import { WeekdayShiftComparison } from "./weekday-shift-comparison";

export type ReportData = { periodFacts: ClosureFacts[]; weeklyFacts: ClosureFacts[]; shiftFacts?: ShiftFact[]; courierRuns?: CourierReportRun[]; pendingCreditCents: number };
const presets: { preset: ReportSelection["preset"]; label: string }[] = [
  { preset: "this-week", label: "Esta semana" }, { preset: "last-week", label: "Semana anterior" },
  { preset: "this-month", label: "Este mes" }, { preset: "last-month", label: "Mes anterior" },
  { preset: "custom", label: "Personalizado" },
];
const weekdays = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const dateLabel = (date: string) => new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

export function ReportsPageContent() {
  const [today] = useState(() => todayInLima());
  const [selection, setSelection] = useState<ReportSelection>({ preset: "this-month" });
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const range = resolveReportRange(selection, today);
        const user = await getAuthenticatedUser();
        if (!user) throw new Error("Inicia sesión para consultar reportes.");
        const { business } = await getBusinessContext(user.id);
        const result = await getReportsData(business.id, range, today);
        if (active) { setData(result); setError(""); }
      } catch (cause) {
        if (active) { setData(null); setError(cause instanceof Error ? cause.message : "No se pudieron cargar los reportes."); }
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [selection, today]);
  return <ReportsView data={data} today={today} selection={selection} loading={loading} error={error} onSelectionChange={(next) => { setLoading(true); setSelection(next); }} />;
}

export function ReportsView({ data, today, selection, loading = false, error = "", preview = false, onSelectionChange }: {
  data: ReportData | null; today: string; selection: ReportSelection; loading?: boolean; error?: string; preview?: boolean;
  onSelectionChange?: (selection: ReportSelection) => void;
}) {
  const initial = resolveReportRange({ preset: "this-month" }, today);
  const [start, setStart] = useState(selection.start ?? initial.start);
  const [end, setEnd] = useState(selection.end ?? today);
  const [inputError, setInputError] = useState("");
  const range = resolveReportRange(selection, today);
  const report = data ? buildReport(data.periodFacts, data.weeklyFacts, range, today) : null;
  const shiftSummary = summarizeShifts(data?.shiftFacts ?? []);
  const weekdayShifts = summarizeWeekdayShifts(data?.shiftFacts ?? [], range);
  const courierSummary = summarizeCouriers(data?.courierRuns ?? []);
  const shiftsByDate = new Map<string, Record<"AM" | "PM", { salesCents: number; soldQuantity: number } | null>>();
  for (const row of data?.shiftFacts ?? []) {
    const current = shiftsByDate.get(row.date) ?? { AM: null, PM: null };
    const previous = current[row.shift];
    current[row.shift] = { salesCents: (previous?.salesCents ?? 0) + row.salesCents, soldQuantity: (previous?.soldQuantity ?? 0) + row.soldQuantity };
    shiftsByDate.set(row.date, current);
  }
  const maxSales = Math.max(0, ...(report?.weekdays.map((day) => day.salesCents ?? 0) ?? []));
  const applyCustom = () => {
    try {
      resolveReportRange({ preset: "custom", start, end }, today);
      setInputError("");
      onSelectionChange?.({ preset: "custom", start, end });
    } catch (cause) { setInputError(cause instanceof Error ? cause.message : "Rango inválido."); }
  };

  return <div className="space-y-5 pb-4">
    <header><span className="inline-block rounded-full bg-[var(--green-soft)] px-3 py-1 text-[0.7rem] font-extrabold uppercase tracking-wide text-[var(--green-dark)]">Análisis</span><h1 className="mt-3 text-3xl font-black tracking-tight">Reportes</h1><p className="mt-1 text-sm text-[var(--muted)]">Ventas, utilidad y panes de los días realmente operados.</p>{preview && <p className="mt-2 text-xs font-bold text-[#8c591c]">Demostración con datos ficticios</p>}</header>
    <section className="card p-4 sm:p-5" aria-label="Filtros del reporte"><h2 className="flex items-center gap-2 text-sm font-extrabold"><CalendarRange size={18} className="text-[var(--green-dark)]" /> Periodo</h2><div className="mt-3 flex flex-wrap gap-2">{presets.map((option) => <button key={option.preset} type="button" aria-pressed={selection.preset === option.preset} onClick={() => option.preset === "custom" ? applyCustom() : onSelectionChange?.({ preset: option.preset })} className={`min-h-10 rounded-xl px-3 text-xs font-bold ${selection.preset === option.preset ? "bg-[var(--green)] text-white" : "bg-[var(--surface-muted)] text-[var(--muted)]"}`}>{option.label}</button>)}</div><div className="mt-4 flex flex-wrap items-end gap-3"><label className="min-w-36 flex-1 text-xs font-bold text-[var(--muted)] sm:flex-none">Desde<input aria-label="Desde" type="date" value={start} max={today} onChange={(event) => setStart(event.target.value)} className="mt-1 block min-h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3 text-sm text-[var(--text)]" /></label><label className="min-w-36 flex-1 text-xs font-bold text-[var(--muted)] sm:flex-none">Hasta<input aria-label="Hasta" type="date" value={end} max={today} onChange={(event) => setEnd(event.target.value)} className="mt-1 block min-h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3 text-sm text-[var(--text)]" /></label><button type="button" onClick={applyCustom} className="min-h-11 rounded-xl border border-[var(--green)] px-4 text-xs font-extrabold text-[var(--green-dark)]">Aplicar rango</button></div>{inputError && <p role="alert" className="mt-2 text-xs text-red-700">{inputError}</p>}<p className="mt-3 text-xs text-[var(--muted)]">{dateLabel(range.start)} – {dateLabel(range.end)} · Una fecha sin registro no se cuenta como cero.</p></section>
    {error && <div className="card flex items-start gap-3 p-5 text-sm text-red-700" role="alert"><AlertCircle size={20} />{error}</div>}
    {loading ? <div className="flex min-h-52 items-center justify-center gap-3 text-sm text-[var(--muted)]" role="status"><LoaderCircle className="animate-spin" size={19} /> Cargando reportes…</div> : report && <>
      {report.total.operatedDays === 0 && <div className="card p-6 text-sm text-[var(--muted)]" role="status"><strong className="text-[var(--text)]">No hay días operados en este periodo.</strong> Prueba otro rango o registra un día. Los promedios quedan vacíos hasta tener datos.</div>}
      <section aria-label="Resumen del periodo"><div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-lg font-black">Resumen del periodo</h2><span className="text-xs font-semibold text-[var(--muted)]">{report.total.operatedDays} {report.total.operatedDays === 1 ? "día operado" : "días operados"}</span></div><div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[["Ventas", formatMoney(report.total.salesCents)], ["Panes vendidos", String(report.total.soldQuantity)], ["Utilidad", formatMoney(report.total.profitCents)], ["Margen", report.total.marginBps === null ? "—" : `${(report.total.marginBps / 100).toFixed(1)}%`]].map(([label, value]) => <div key={label} className="card min-w-0 p-4 sm:p-5"><p className="text-xs font-bold text-[var(--muted)]">{label}</p><p className="mt-2 truncate text-xl font-black tracking-tight sm:text-2xl">{value}</p></div>)}</div></section>
      <section className="card p-5 sm:p-6" aria-label="Ventas por turno"><h2 className="text-lg font-black">AM frente a PM</h2><p className="mt-1 text-xs text-[var(--muted)]">Cada turno se analiza por separado; ambos permanecen dentro del mismo día operado.</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{shiftSummary.map((item) => <div key={item.shift} className="rounded-xl bg-[var(--surface-muted)] p-4"><h3 className="text-sm font-extrabold">Turno {item.shift}</h3><p className="mt-2 text-xl font-black">{formatMoney(item.salesCents)}</p><p className="mt-1 text-xs text-[var(--muted)]">{item.soldQuantity} panes · {item.operatedShifts} turnos registrados · resultado contable {item.profitCents === null ? "—" : formatMoney(item.profitCents)}</p><p className="mt-1 text-xs text-[var(--muted)]">Venta media por turno: {item.averageSalesCents === null ? "—" : formatMoney(item.averageSalesCents)}</p></div>)}</div><p className="mt-3 text-xs text-[var(--muted)]">El costo se registra en el turno de compra; si los panes pasan a PM, solo la utilidad diaria conjunta refleja el resultado completo.</p>{shiftSummary.some((item) => item.profitCents === null) && <p className="mt-2 text-xs text-[var(--muted)]">El resultado por turno no se atribuye a filas históricas del Excel cuando los gastos no indican turno.</p>}{new Set((data?.shiftFacts ?? []).map((item) => item.date)).size < report.total.operatedDays && <p className="mt-3 text-xs text-[#8c591c]">El desglose AM/PM aún no incluye todos los días de este periodo; el total diario sí los incluye.</p>}</section>
      <section className="card p-5 sm:p-6" aria-label="Ventas diarias por turno"><h2 className="text-lg font-black">Cada día, turno a turno</h2><p className="mt-1 text-xs text-[var(--muted)]">Un cero significa turno registrado sin ventas; «—» significa que no hay desglose de ese turno.</p><div className="mt-4 max-h-96 overflow-auto"><table className="w-full min-w-[35rem] text-left text-sm"><thead className="sticky top-0 bg-white text-xs text-[var(--muted)]"><tr><th scope="col" className="py-2 pr-4">Fecha</th><th scope="col" className="py-2 pr-4">AM</th><th scope="col" className="py-2 pr-4">PM</th><th scope="col" className="py-2 text-right">Total del día</th></tr></thead><tbody className="divide-y divide-[var(--border)]">{[...report.days].reverse().map((day) => { const shifts = shiftsByDate.get(day.date); return <tr key={day.date}><th scope="row" className="py-3 pr-4 font-bold">{dateLabel(day.date)}</th>{(["AM", "PM"] as const).map((shift) => <td key={shift} className="py-3 pr-4">{shifts?.[shift] ? <>{formatMoney(shifts[shift].salesCents)}<span className="block text-xs text-[var(--muted)]">{shifts[shift].soldQuantity} panes</span></> : "—"}</td>)}<td className="py-3 text-right font-extrabold">{formatMoney(day.salesCents)}<span className="block text-xs font-normal text-[var(--muted)]">{day.soldQuantity} panes</span></td></tr>; })}</tbody></table></div></section>
      <section className="card p-5 sm:p-6" aria-label="Repartidores por turno">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-black">Repartidores</h2><p className="mt-1 text-xs text-[var(--muted)]">Panes entregados y comisiones por persona, separados en AM y PM.</p></div>{courierSummary.length > 0 && <p className="text-xs font-bold text-[var(--green-dark)]">{courierSummary.reduce((sum, row) => sum + row.deliveredQuantity, 0)} panes · {formatMoney(courierSummary.reduce((sum, row) => sum + row.commissionCents, 0))} en comisiones</p>}</div>
        {courierSummary.length === 0 ? <p className="mt-4 rounded-xl bg-[var(--surface-muted)] p-4 text-sm text-[var(--muted)]">No hay repartos con repartidor identificado en este periodo.</p> : <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[38rem] text-left text-sm"><thead className="border-b border-[var(--border)] text-xs text-[var(--muted)]"><tr><th scope="col" className="py-2 pr-4">Repartidor</th><th scope="col" className="py-2 pr-4">AM</th><th scope="col" className="py-2 pr-4">PM</th><th scope="col" className="py-2 pr-4 text-right">Total panes</th><th scope="col" className="py-2 pr-4 text-right">Comisión</th><th scope="col" className="py-2 text-right">Días</th></tr></thead><tbody className="divide-y divide-[var(--border)]">{courierSummary.map((row) => <tr key={row.id}><th scope="row" className="py-3 pr-4 font-bold">{row.name}</th>{(["AM", "PM"] as const).map((shift) => <td key={shift} className="py-3 pr-4">{row[shift].deliveredQuantity} panes<span className="block text-xs text-[var(--muted)]">{formatMoney(row[shift].commissionCents)}</span></td>)}<td className="py-3 pr-4 text-right font-extrabold">{row.deliveredQuantity}</td><td className="py-3 pr-4 text-right font-extrabold">{formatMoney(row.commissionCents)}</td><td className="py-3 text-right">{row.operatedDays}</td></tr>)}</tbody></table></div>}
        <p className="mt-3 text-xs text-[var(--muted)]">Solo incluye cierres nuevos con repartidor identificado. El Excel histórico no asigna nombres, por lo que sus comisiones siguen en el total general pero no se atribuyen aquí. Panes entregados no equivale a ingresos por repartidor.</p>
      </section>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(19rem,0.85fr)]"><section className="card p-5 sm:p-6"><h2 className="text-lg font-black">Promedios y operación</h2><p className="mt-1 text-xs text-[var(--muted)]">Ventas y utilidad por día operado; precio y costo por unidad.</p><dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4 text-sm sm:grid-cols-3">{[["Venta diaria promedio", report.averages.salesCents === null ? "—" : formatMoney(report.averages.salesCents)], ["Utilidad diaria promedio", report.averages.profitCents === null ? "—" : formatMoney(report.averages.profitCents)], ["Precio promedio", report.averages.priceCents === null ? "—" : formatMoney(report.averages.priceCents)], ["Costo promedio", report.averages.costCents === null ? "—" : formatMoney(report.averages.costCents)], ["Comisiones", formatMoney(report.commissionCents)], ["Créditos pendientes", formatMoney(data?.pendingCreditCents ?? 0)]].map(([label, value]) => <div key={label} className="border-t border-[var(--border)] pt-3"><dt className="text-xs text-[var(--muted)]">{label}</dt><dd className="mt-1 font-black">{value}</dd></div>)}</dl><p className="mt-4 text-xs text-[var(--muted)]">Créditos: saldo pendiente hoy de ventas hechas en el periodo elegido.</p></section><section className="card p-5 sm:p-6"><h2 className="text-lg font-black">Destino de los panes</h2><p className="mt-1 text-xs text-[var(--muted)]">Incluye días registrados con cero ventas.</p><div className="mt-5 grid grid-cols-3 gap-2 text-center">{[["Vendidos", report.total.soldQuantity], ["Regalados", report.total.giftedQuantity], ["Consumidos", report.total.consumedQuantity]].map(([label, value]) => <div key={label} className="rounded-2xl bg-[var(--surface-muted)] px-2 py-4"><strong className="block text-2xl font-black">{value}</strong><span className="text-[0.7rem] font-semibold text-[var(--muted)]">{label}</span></div>)}</div></section></div>
      <div className="grid gap-4 xl:grid-cols-2"><section className="card p-5 sm:p-6"><h2 className="text-lg font-black">Mejores días de la semana</h2><p className="mt-1 text-xs text-[var(--muted)]">Promedios de cada día realmente operado dentro del periodo.</p><div className="mt-5 space-y-3">{report.weekdays.map((day) => <div key={day.index} className="grid grid-cols-[5.5rem_minmax(0,1fr)_5rem] items-center gap-2 text-xs sm:grid-cols-[6.5rem_minmax(0,1fr)_6rem]"><span className="font-bold">{weekdays[day.index]}</span><div className="h-2.5 overflow-hidden rounded-full bg-[var(--surface-muted)]"><div className="h-full rounded-full bg-[var(--green)]" style={{ width: `${maxSales > 0 ? Math.max(0, day.salesCents ?? 0) / maxSales * 100 : 0}%` }} /></div><span className="text-right font-extrabold">{day.salesCents === null ? "—" : formatMoney(day.salesCents)}</span><span className="col-start-2 col-span-2 -mt-1 text-[0.66rem] text-[var(--muted)]">{day.count === 0 ? "Sin días operados" : `${day.count} ${day.count === 1 ? "día" : "días"} · ${day.soldQuantity} panes prom. · ${formatMoney(day.profitCents ?? 0)} utilidad prom.`}</span></div>)}</div></section><section className="card p-5 sm:p-6"><h2 className="text-lg font-black">Esta semana vs anterior</h2><p className="mt-1 text-xs text-[var(--muted)]">De lunes hasta el mismo día de la semana; solo días operados equivalentes.</p><p className="mt-3 rounded-xl bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--muted)]">{report.comparison.comparable ? "Mismos días operados en ambas semanas." : "Sin porcentaje: faltan días equivalentes operados en ambas semanas."}</p><div className="mt-4 divide-y divide-[var(--border)]">{[["Ventas", report.comparison.current.salesCents, report.comparison.previous.salesCents, true], ["Utilidad", report.comparison.current.profitCents, report.comparison.previous.profitCents, true], ["Panes vendidos", report.comparison.current.soldQuantity, report.comparison.previous.soldQuantity, false]].map(([label, current, previous, money]) => { const currentValue = Number(current); const previousValue = Number(previous); const change = report.comparison.comparable ? comparableChange(currentValue, previousValue) : null; return <div key={String(label)} className="flex items-center justify-between gap-3 py-3 text-sm"><div><p className="font-bold">{label}</p><p className="mt-0.5 text-xs text-[var(--muted)]">Anterior: {money ? formatMoney(previousValue) : previousValue}</p></div><div className="text-right"><strong>{money ? formatMoney(currentValue) : currentValue}</strong><span className={`ml-2 text-xs font-extrabold ${change === null ? "text-[var(--muted)]" : change >= 0 ? "text-[var(--green-dark)]" : "text-[#b05a31]"}`}>{change === null ? "—" : `${change > 0 ? "+" : ""}${change.toFixed(1)}%`}</span></div></div>; })}</div></section></div>
      <WeekdayShiftComparison summary={weekdayShifts} incomplete={new Set((data?.shiftFacts ?? []).map((item) => item.date)).size < report.total.operatedDays} />
    </>}
  </div>;
}
