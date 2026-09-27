"use client";

import { useEffect, useState } from "react";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { getBusinessContext } from "@/lib/supabase/queries/business";
import { getLegacyArchive } from "@/lib/supabase/queries/legacy";
import { formatMoney } from "@/lib/format/money";

type Archive = Awaited<ReturnType<typeof getLegacyArchive>>;
const sections = [
  { key: "Ventas_Diarias", title: "Ventas por turno", columns: [["C", "Turno"], ["D", "Comprados"], ["G", "Vendidos"], ["M", "Venta S/"], ["N", "Fiado S/"], ["P", "Aporte Fabiana S/"], ["Q", "Aporte Fabián S/"], ["S", "Notas"]] },
  { key: "Creditos_Clientes", title: "Fiados", columns: [["B", "Cliente"], ["C", "Panes"], ["E", "Monto S/"], ["F", "Estado en Excel"], ["G", "Fecha en Excel"], ["H", "Notas"]] },
  { key: "Gastos_Generales", title: "Gastos generales", columns: [["B", "Concepto"], ["C", "Fabiana S/"], ["D", "Fabián S/"], ["E", "Total S/"], ["F", "Notas"]] },
  { key: "Sorteos_Domingos", title: "Sorteos", columns: [["B", "Semana"], ["C", "Premio S/"], ["D", "Ganadores"], ["E", "Fabiana S/"], ["F", "Fabián S/"], ["G", "Notas"]] },
  { key: "Notas", title: "Notas y supuestos del libro", columns: [["B", "Texto"]] },
] as const;

function display(value: unknown) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

export function LegacyArchivePage() {
  const [archive, setArchive] = useState<Archive | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const user = await getAuthenticatedUser();
        if (!user) throw new Error("Inicia sesión para ver el archivo histórico.");
        const { business } = await getBusinessContext(user.id);
        const data = await getLegacyArchive(business.id);
        if (active) setArchive(data);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "No se pudo cargar el archivo.");
      }
    })();
    return () => { active = false; };
  }, []);

  const attested = new Map(archive?.attestations.map((item) => [item.credit_row, item]) ?? []);
  return <div>
    <header className="mb-6"><h1 className="text-3xl font-black">Archivo histórico del Excel</h1><p className="mt-2 text-sm text-[var(--muted)]">Registros originales conservados para consulta. Las columnas calculadas del libro son referencia, no nuevos movimientos de caja.</p></header>
    {error && <p className="card p-5 text-sm text-red-700" role="alert">{error}</p>}
    {!archive && !error && <p className="card p-5 text-sm">Cargando archivo…</p>}
    {archive && archive.rows.length === 0 && <p className="card p-5 text-sm">Todavía no se ha importado el Excel.</p>}
    {archive && archive.rows.length > 0 && <>
      <p className="mb-5 rounded-xl bg-[var(--orange-soft)] p-4 text-sm text-[#6b4215]">Se conservan {archive.rows.length} filas de origen. Los fiados del 16 y 18 de septiembre figuran pendientes en el Excel; por indicación posterior se registran cobrados el 26/09/2026 (fecha asumida), S/9 cada uno. Son cobros de ventas anteriores, no ventas nuevas.</p>
      <section className="mb-7"><h2 className="mb-2 text-xl font-extrabold">Aportes y participación histórica</h2><p className="mb-3 text-sm text-[var(--muted)]">Aportes y gastos pagados según el libro; utilidad económica repartida 50/50. La liquidación fue reportada, pero el libro no documenta el importe efectivo entregado a cada socio. Preventa, caja retenida y cobros sin fecha impiden inferirlo con seguridad.</p><div className="card overflow-x-auto"><table className="w-full min-w-[850px] text-left text-xs"><thead className="bg-[var(--surface-muted)] text-[var(--muted)]"><tr><th className="p-3">Fecha</th><th className="p-3">Compra</th><th className="p-3">Capital Fabiana</th><th className="p-3">Capital Fabián</th><th className="p-3">Gasto pagado Fabiana</th><th className="p-3">Gasto pagado Fabián</th><th className="p-3">Utilidad Fabiana</th><th className="p-3">Utilidad Fabián</th><th className="p-3">Caja entregada</th></tr></thead><tbody className="divide-y divide-[var(--border)]">{archive.dailyFacts.map((day) => <tr key={day.operating_date}><td className="whitespace-nowrap p-3 font-bold">{day.operating_date}</td><td className="p-3">{formatMoney(day.purchase_cost_cents)}</td><td className="p-3">{day.fabiana_capital_cents === null ? "Sin dato" : formatMoney(day.fabiana_capital_cents)}</td><td className="p-3">{day.fabian_capital_cents === null ? "Sin dato" : formatMoney(day.fabian_capital_cents)}</td><td className="p-3">{formatMoney(day.fabiana_expenses_paid_cents)}</td><td className="p-3">{formatMoney(day.fabian_expenses_paid_cents)}</td><td className="p-3">{formatMoney(day.fabiana_profit_cents)}</td><td className="p-3">{formatMoney(day.fabian_profit_cents)}</td><td className="p-3">Monto no documentado</td></tr>)}</tbody></table></div></section>
      {sections.map((section) => {
        const rows = archive.rows.filter((row) => row.sheet_name === section.key);
        return <section key={section.key} className="mb-7"><h2 className="mb-3 text-xl font-extrabold">{section.title} <span className="text-sm font-medium text-[var(--muted)]">({rows.length})</span></h2><div className="card overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead className="bg-[var(--surface-muted)] text-[var(--muted)]"><tr><th className="p-3">Fecha / fila</th>{section.columns.map(([key, label]) => <th key={key} className="p-3">{label}</th>)}{section.key === "Creditos_Clientes" && <th className="p-3">Confirmación posterior</th>}{section.key === "Ventas_Diarias" && <th className="p-3">Corrección confirmada</th>}</tr></thead><tbody className="divide-y divide-[var(--border)]">{rows.map((row) => <tr key={`${row.sheet_name}-${row.source_row}`}><td className="whitespace-nowrap p-3 font-bold">{row.record_date ?? "—"} · #{row.source_row}</td>{section.columns.map(([key]) => <td key={key} className="max-w-96 p-3 align-top">{display(row.cells[key])}</td>)}{section.key === "Creditos_Clientes" && <td className="p-3 font-semibold">{attested.has(row.source_row) ? `Cobrado ${attested.get(row.source_row)?.payment_date} · fecha asumida` : "—"}</td>}{section.key === "Ventas_Diarias" && <td className="max-w-96 p-3 font-semibold text-[var(--green-dark)]">{display(row.correction.note)}</td>}</tr>)}</tbody></table></div></section>;
      })}
    </>}
  </div>;
}
