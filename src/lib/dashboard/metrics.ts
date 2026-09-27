import { addDays, mondayOf, monthStart } from "../dates/lima";
import { calculateMargin, calculateProfit } from "../finance/calculations";

export type ClosureFacts = {
  id: string;
  date: string;
  purchasedQuantity: number;
  soldQuantity: number;
  giftedQuantity: number;
  consumedQuantity: number;
  salesCents: number;
  purchaseCostCents: number;
  commissionCents: number;
  expensesCents: number;
  profitCents: number;
  ownerProfitSharesCents: number[];
};

export type DashboardLines = {
  purchases: { daily_closure_id: string; quantity: number; unit_cost_cents: number }[];
  sales: { daily_closure_id: string; quantity: number; unit_price_cents: number }[];
  leftovers: { daily_closure_id: string; gifted_quantity: number; consumed_quantity: number }[];
  couriers: { daily_closure_id: string; delivered_quantity: number; commission_per_unit_cents: number; additional_commission_cents: number }[];
  expenses: { daily_closure_id: string; amount_cents: number }[];
  settlements: { daily_closure_id: string; economic_profit_share_cents: number; profit_share_bps: number }[];
};

export type Summary = {
  operatedDays: number;
  salesCents: number;
  profitCents: number;
  soldQuantity: number;
  giftedQuantity: number;
  consumedQuantity: number;
  marginBps: number | null;
};

export function makeClosureFacts(closures: { id: string; operating_date: string }[], lines: DashboardLines): ClosureFacts[] {
  const grouped = <T extends { daily_closure_id: string }>(items: T[]) => {
    const result = new Map<string, T[]>();
    for (const item of items) {
      const bucket = result.get(item.daily_closure_id);
      if (bucket) bucket.push(item);
      else result.set(item.daily_closure_id, [item]);
    }
    return result;
  };
  const purchases = grouped(lines.purchases);
  const sales = grouped(lines.sales);
  const leftovers = grouped(lines.leftovers);
  const couriers = grouped(lines.couriers);
  const expenses = grouped(lines.expenses);
  const settlements = grouped(lines.settlements);
  return closures.map((closure) => {
    const id = closure.id;
    const purchaseRows = purchases.get(id) ?? [];
    const saleRows = sales.get(id) ?? [];
    const leftoverRows = leftovers.get(id) ?? [];
    const courierRows = couriers.get(id) ?? [];
    const expenseRows = expenses.get(id) ?? [];
    const salesCents = saleRows.reduce((sum, row) => sum + row.quantity * row.unit_price_cents, 0);
    const purchaseCostCents = purchaseRows.reduce((sum, row) => sum + row.quantity * row.unit_cost_cents, 0);
    const commissionCents = courierRows.reduce((sum, row) => sum + row.delivered_quantity * row.commission_per_unit_cents + row.additional_commission_cents, 0);
    const expensesCents = expenseRows.reduce((sum, row) => sum + row.amount_cents, 0);
    return {
      id, date: closure.operating_date,
      purchasedQuantity: purchaseRows.reduce((sum, row) => sum + row.quantity, 0),
      soldQuantity: saleRows.reduce((sum, row) => sum + row.quantity, 0),
      giftedQuantity: leftoverRows.reduce((sum, row) => sum + row.gifted_quantity, 0),
      consumedQuantity: leftoverRows.reduce((sum, row) => sum + row.consumed_quantity, 0),
      salesCents, purchaseCostCents, commissionCents, expensesCents,
      profitCents: calculateProfit(salesCents, purchaseCostCents, commissionCents, expensesCents),
      ownerProfitSharesCents: (settlements.get(id) ?? []).sort((a, b) => b.profit_share_bps - a.profit_share_bps).map((row) => row.economic_profit_share_cents),
    };
  }).sort((a, b) => a.date.localeCompare(b.date));
}

export function summarize(days: ClosureFacts[]): Summary {
  const salesCents = days.reduce((sum, day) => sum + day.salesCents, 0);
  const profitCents = days.reduce((sum, day) => sum + day.profitCents, 0);
  return {
    operatedDays: days.length, salesCents, profitCents,
    soldQuantity: days.reduce((sum, day) => sum + day.soldQuantity, 0),
    giftedQuantity: days.reduce((sum, day) => sum + day.giftedQuantity, 0),
    consumedQuantity: days.reduce((sum, day) => sum + day.consumedQuantity, 0),
    marginBps: calculateMargin(profitCents, salesCents),
  };
}

export function comparableChange(current: number, previous: number): number | null {
  if (previous <= 0 || current < 0) return null;
  return Math.round((current - previous) * 1000 / previous) / 10;
}

export function buildDashboard(days: ClosureFacts[], today: string) {
  const byDate = new Map(days.map((day) => [day.date, day]));
  const currentMonday = mondayOf(today);
  const previousMonday = addDays(currentMonday, -7);
  const elapsed = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${currentMonday}T12:00:00Z`)) / 86400000);
  const currentWeek = days.filter((day) => day.date >= currentMonday && day.date <= today);
  const previousWeek = days.filter((day) => day.date >= previousMonday && day.date <= addDays(previousMonday, elapsed));
  const currentWeekdays = currentWeek.map((day) => new Date(`${day.date}T12:00:00Z`).getUTCDay()).sort().join(",");
  const previousWeekdays = previousWeek.map((day) => new Date(`${day.date}T12:00:00Z`).getUTCDay()).sort().join(",");
  const weeksComparable = currentWeek.length >= 2 && currentWeekdays === previousWeekdays;
  const currentSummary = summarize(currentWeek);
  const previousSummary = summarize(previousWeek);
  const todayClosure = byDate.get(today) ?? null;
  const sameWeekdayLastWeek = byDate.get(addDays(today, -7)) ?? null;
  const chart = (period: "7d" | "30d" | "month") => {
    const start = period === "7d" ? addDays(today, -6) : period === "30d" ? addDays(today, -29) : monthStart(today);
    const points = [];
    for (let date = start; date <= today; date = addDays(date, 1)) {
      const closure = byDate.get(date);
      points.push({ date, salesCents: closure?.salesCents ?? null, profitCents: closure?.profitCents ?? null, operated: Boolean(closure) });
    }
    return points;
  };
  const insights: string[] = [];
  if (weeksComparable) {
    const salesChange = comparableChange(currentSummary.salesCents, previousSummary.salesCents);
    if (salesChange !== null && Math.abs(salesChange) >= 1) {
      insights.push(`En los mismos días operados, las ventas van ${salesChange > 0 ? "por encima" : "por debajo"} de la semana anterior (${Math.abs(salesChange).toFixed(1)}%).`);
    }
  }
  const nonSold = currentSummary.giftedQuantity + currentSummary.consumedQuantity;
  if (nonSold > 0) insights.push(`Esta semana registraste ${nonSold} ${nonSold === 1 ? "pan" : "panes"} regalados o consumidos.`);
  if (currentWeek.length >= 3) {
    const ranked = [...currentWeek].sort((a, b) => b.salesCents - a.salesCents);
    if (ranked[0].salesCents > ranked[1].salesCents && ranked[0].salesCents > 0) {
      const weekday = new Intl.DateTimeFormat("es-PE", { weekday: "long", timeZone: "UTC" }).format(new Date(`${ranked[0].date}T12:00:00Z`));
      insights.push(`El ${weekday} fue el día de mayor venta de esta semana (${(ranked[0].salesCents / 100).toFixed(2)} soles).`);
    }
  }
  return {
    todayClosure, sameWeekdayLastWeek, currentWeek, previousWeek,
    currentSummary, previousSummary, weeksComparable, chart, insights,
    latestDate: days.at(-1)?.date ?? null,
  };
}
