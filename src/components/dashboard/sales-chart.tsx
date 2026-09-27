"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { buildDashboard, type ClosureFacts } from "@/lib/dashboard/metrics";
import { formatMoney } from "@/lib/format/money";

type Period = "7d" | "30d" | "month";
const periods: { key: Period; label: string }[] = [
  { key: "7d", label: "7 días" }, { key: "30d", label: "30 días" }, { key: "month", label: "Este mes" },
];

function MoneyTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ payload: { operated: boolean }; value: number | null; name: string; color: string }>;
  label?: string;
}) {
  if (!active || !label) return null;
  const formattedDate = new Intl.DateTimeFormat("es-PE", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${label}T12:00:00Z`));
  return <div className="rounded-2xl border border-[var(--border)] bg-white p-3 text-xs shadow-xl">
    <p className="mb-2 font-bold capitalize text-[var(--text)]">{formattedDate}</p>
    {payload?.[0]?.payload.operated ? payload.map((entry) => <p key={entry.name} className="mt-1 flex items-center gap-2 text-[var(--muted)]"><span className="size-2 rounded-full" style={{ background: entry.color }} />{entry.name}: <strong className="text-[var(--text)]">{formatMoney(Math.round((entry.value ?? 0) * 100))}</strong></p>) : <p className="text-[var(--muted)]">Sin registro</p>}
  </div>;
}

export function SalesChart({ days, today }: { days: ClosureFacts[]; today: string }) {
  const [period, setPeriod] = useState<Period>("7d");
  const points = useMemo(() => buildDashboard(days, today).chart(period), [days, today, period]);
  const operated = points.filter((point) => point.operated).length;
  const zeroSales = points.filter((point) => point.operated && point.salesCents === 0).length;
  const data = points.map((point) => ({ ...point, sales: point.salesCents === null ? null : point.salesCents / 100, profit: point.profitCents === null ? null : point.profitCents / 100 }));
  return <section className="card min-w-0 p-4 sm:p-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div><h2 className="text-lg font-extrabold tracking-[-0.025em]">Ventas y utilidad</h2><div className="mt-2 flex items-center gap-4 text-xs font-semibold text-[var(--muted)]"><span className="flex items-center gap-2"><i className="size-2.5 rounded-full bg-[var(--green)]" />Ventas</span><span className="flex items-center gap-2"><i className="size-2.5 rounded-full bg-[var(--orange)]" />Utilidad</span></div></div>
      <div className="flex w-full rounded-xl bg-[var(--surface-muted)] p-1 sm:w-auto" aria-label="Periodo del gráfico">{periods.map((item) => <button key={item.key} type="button" onClick={() => setPeriod(item.key)} aria-pressed={period === item.key} className={`min-h-9 flex-1 rounded-lg px-3 text-xs font-bold transition sm:flex-none ${period === item.key ? "bg-white text-[var(--green-dark)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--text)]"}`}>{item.label}</button>)}</div>
    </div>
    {operated === 0 ? <div className="mt-5 grid h-64 place-items-center rounded-2xl bg-[var(--surface-muted)] px-6 text-center"><div><p className="font-bold">Sin días operados en este periodo</p><p className="mt-1 text-sm text-[var(--muted)]">El gráfico aparecerá cuando haya un día registrado.</p></div></div> : <div className="mt-5 h-64 w-full sm:h-[19rem]" role="img" aria-label={`Gráfico de ventas y utilidad con ${operated} días operados`}><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 8, right: 2, left: -18, bottom: 0 }} barGap={3}><CartesianGrid stroke="#eceae4" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#6f7a8d", fontSize: 11 }} minTickGap={18} tickFormatter={(value: string) => period === "7d" ? new Intl.DateTimeFormat("es-PE", { weekday: "short", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)) : value.slice(8)} dy={8} /><YAxis axisLine={false} tickLine={false} tick={{ fill: "#8992a2", fontSize: 11 }} /><Tooltip content={<MoneyTooltip />} cursor={{ fill: "rgba(231,246,237,0.4)" }} /><Bar dataKey="sales" name="Ventas" fill="#20a66a" radius={[5, 5, 0, 0]} maxBarSize={34} /><Bar dataKey="profit" name="Utilidad" fill="#f5a13a" radius={[5, 5, 0, 0]} maxBarSize={34} /></BarChart></ResponsiveContainer></div>}
    <p className="mt-2 text-xs text-[var(--muted)]">{operated} {operated === 1 ? "día operado" : "días operados"}{zeroSales > 0 ? ` · ${zeroSales} ${zeroSales === 1 ? "día" : "días"} con cero ventas` : ""}. Los días sin registro no se cuentan como ventas de S/ 0.</p>
  </section>;
}
