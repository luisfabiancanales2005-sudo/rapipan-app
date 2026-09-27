import type { ClosureFacts } from "@/lib/dashboard/metrics";
import { getSupabaseClient } from "../client";

export async function getLegacyFacts(businessId: string, start: string, end: string): Promise<ClosureFacts[]> {
  const { data, error } = await getSupabaseClient().from("legacy_daily_facts").select("*")
    .eq("business_id", businessId).gte("operating_date", start).lte("operating_date", end)
    .order("operating_date").limit(500);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: `legacy-${row.operating_date}`, date: row.operating_date,
    purchasedQuantity: row.purchased_quantity, soldQuantity: row.sold_quantity,
    giftedQuantity: row.gifted_quantity, consumedQuantity: row.consumed_quantity,
    salesCents: row.sales_cents, purchaseCostCents: row.purchase_cost_cents,
    commissionCents: row.commission_cents,
    expensesCents: row.general_expenses_cents + row.commercial_adjustment_cents,
    profitCents: row.profit_cents,
    ownerProfitSharesCents: [row.fabiana_profit_cents, row.fabian_profit_cents],
  }));
}

export function mergeHistoricalFacts(legacy: ClosureFacts[], normal: ClosureFacts[]): ClosureFacts[] {
  const byDate = new Map(legacy.map((fact) => [fact.date, fact]));
  for (const fact of normal) byDate.set(fact.date, fact);
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
