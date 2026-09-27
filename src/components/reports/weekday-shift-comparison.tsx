import { formatMoney } from "@/lib/format/money";
import type { summarizeWeekdayShifts } from "@/lib/reports/metrics";

const weekdays = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
type Summary = ReturnType<typeof summarizeWeekdayShifts>;

export function WeekdayShiftComparison({ summary, incomplete }: { summary: Summary; incomplete: boolean }) {
  const best = {
    AM: Math.max(0, ...summary.map((day) => day.AM.salesCents ?? 0)),
    PM: Math.max(0, ...summary.map((day) => day.PM.salesCents ?? 0)),
  };

  return <section className="card p-5 sm:p-6" aria-label="Mejores días por turno">
    <h2 className="text-lg font-black">Mejores días por turno</h2>
    <p className="mt-1 text-xs text-[var(--muted)]">Venta promedio de cada AM y PM registrado en el periodo. Así puedes comparar, por ejemplo, las mañanas de los miércoles con las tardes de los miércoles.</p>
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[23rem] text-left text-sm">
        <thead className="border-b border-[var(--border)] text-xs text-[var(--muted)]"><tr>
          <th scope="col" className="py-2 pr-3">Día</th>
          <th scope="col" className="py-2 pr-3">AM</th>
          <th scope="col" className="py-2">PM</th>
        </tr></thead>
        <tbody className="divide-y divide-[var(--border)]">{summary.map((day) => <tr key={day.index}>
          <th scope="row" className="py-3 pr-3 font-bold">{weekdays[day.index]}</th>
          {(["AM", "PM"] as const).map((shift) => {
            const item = day[shift];
            const isBest = item.salesCents !== null && item.salesCents === best[shift];
            return <td key={shift} className="py-3 pr-3 align-top">
              <span className={isBest ? "font-black text-[var(--green-dark)]" : "font-extrabold"}>{item.salesCents === null ? "—" : formatMoney(item.salesCents)}</span>
              {isBest && <span className="ml-1 text-[0.65rem] font-extrabold text-[var(--green-dark)]">Mejor {shift}</span>}
              <span className="block text-xs text-[var(--muted)]">{item.count === 0 ? "Sin turnos registrados" : `${item.count} ${item.count === 1 ? "turno" : "turnos"} · ${item.soldQuantity} panes prom.`}</span>
            </td>;
          })}
        </tr>)}</tbody>
      </table>
    </div>
    <p className="mt-3 text-xs text-[var(--muted)]">Un cero es un turno registrado sin ventas; «—» indica que no hay registro. Los dos turnos siguen contando como un solo día en las métricas diarias.</p>
    {incomplete && <p className="mt-2 text-xs text-[#8c591c]">No todos los días del periodo tienen desglose AM/PM; la comparación por turno solo refleja los registros disponibles.</p>}
  </section>;
}
