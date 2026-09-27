import { addDays, mondayOf, monthStart } from "../../dates/lima";
import { makeClosureFacts } from "../../dashboard/metrics";
import { getSupabaseClient } from "../client";
import { getLegacyFacts, mergeHistoricalFacts } from "./legacy-facts";

export async function collectPages<T>(fetchPage: (from: number, to: number) => PromiseLike<{
  data: T[] | null;
  error: { message: string } | null;
}>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await fetchPage(from, from + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

export async function getDashboardData(businessId: string, today: string) {
  const client = getSupabaseClient();
  const start = [addDays(today, -29), monthStart(today), addDays(mondayOf(today), -7)].sort()[0];
  const [recentResult, latestResult, legacyFacts, legacyLatest] = await Promise.all([
    client.from("daily_closures").select("id, operating_date")
      .eq("business_id", businessId).eq("status", "closed")
      .gte("operating_date", start).lte("operating_date", today)
      .order("operating_date", { ascending: true }),
    client.from("daily_closures").select("operating_date")
      .eq("business_id", businessId).eq("status", "closed")
      .lte("operating_date", today)
      .order("operating_date", { ascending: false }).limit(1).maybeSingle(),
    getLegacyFacts(businessId, start, today),
    client.from("legacy_daily_facts").select("operating_date")
      .eq("business_id", businessId).lte("operating_date", today)
      .order("operating_date", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (recentResult.error) throw recentResult.error;
  if (latestResult.error) throw latestResult.error;
  if (legacyLatest.error) throw legacyLatest.error;
  const closures = recentResult.data ?? [];
  const normalFacts = await getFactsForClosures(businessId, closures);
  const facts = mergeHistoricalFacts(legacyFacts, normalFacts);
  const latestRecordedDate = [latestResult.data?.operating_date, legacyLatest.data?.operating_date]
    .filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
  return { facts, latestRecordedDate };
}

export async function getFactsForClosures(businessId: string, closures: { id: string; operating_date: string }[]) {
  if (closures.length === 0) return [];
  const client = getSupabaseClient();
  const ids = closures.map((closure) => closure.id);

  const [purchases, sales, leftovers, couriers, expenses, settlements] = await Promise.all([
    collectPages((from, to) => client.from("purchase_lines").select("daily_closure_id, quantity, unit_cost_cents").eq("business_id", businessId).in("daily_closure_id", ids).order("id").range(from, to)),
    collectPages((from, to) => client.from("sale_batches").select("daily_closure_id, quantity, unit_price_cents").eq("business_id", businessId).in("daily_closure_id", ids).order("id").range(from, to)),
    collectPages((from, to) => client.from("leftover_lines").select("daily_closure_id, gifted_quantity, consumed_quantity").eq("business_id", businessId).in("daily_closure_id", ids).order("id").range(from, to)),
    collectPages((from, to) => client.from("courier_runs").select("daily_closure_id, delivered_quantity, commission_per_unit_cents, additional_commission_cents").eq("business_id", businessId).in("daily_closure_id", ids).order("id").range(from, to)),
    collectPages((from, to) => client.from("expenses").select("daily_closure_id, amount_cents").eq("business_id", businessId).in("daily_closure_id", ids).order("id").range(from, to)),
    collectPages((from, to) => client.from("settlements").select("daily_closure_id, economic_profit_share_cents, profit_share_bps").eq("business_id", businessId).in("daily_closure_id", ids).order("id").range(from, to)),
  ]);

  return makeClosureFacts(closures, { purchases, sales, leftovers, couriers, expenses, settlements });
}
