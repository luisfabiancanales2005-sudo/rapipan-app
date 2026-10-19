import { weeklyComparisonRange, type CourierReportRun, type ReportRange, type ShiftFact } from "../../reports/metrics";
import { closureSchema } from "../../validation/daily-close";
import { getSupabaseClient } from "../client";
import { getCreditLedger } from "./credits";
import { collectPages, getFactsForClosures } from "./dashboard";
import { getLegacyFacts, mergeHistoricalFacts } from "./legacy-facts";

export async function getReportsData(businessId: string, range: ReportRange, today: string) {
  const client = getSupabaseClient();
  const week = weeklyComparisonRange(today);
  const [periodClosures, weekClosures, ledger, legacyFacts, legacyShiftRows, couriers] = await Promise.all([
    collectPages((from, to) => client.from("daily_closures").select("id, operating_date, shift_payload")
      .eq("business_id", businessId).eq("status", "closed")
      .gte("operating_date", range.start).lte("operating_date", range.end)
      .order("operating_date").order("id").range(from, to)),
    collectPages((from, to) => client.from("daily_closures").select("id, operating_date, shift_payload")
      .eq("business_id", businessId).eq("status", "closed")
      .gte("operating_date", week.previousStart).lte("operating_date", week.currentEnd)
      .order("operating_date").order("id").range(from, to)),
    getCreditLedger(businessId),
    getLegacyFacts(businessId, range.start < week.previousStart ? range.start : week.previousStart,
      range.end > today ? range.end : today),
    collectPages((from, to) => client.from("legacy_source_rows")
      .select("source_row, record_date, cells").eq("business_id", businessId).eq("sheet_name", "Ventas_Diarias")
      .gte("record_date", range.start).lte("record_date", range.end)
      .order("source_row").range(from, to)),
    collectPages((from, to) => client.from("couriers").select("id, name").eq("business_id", businessId)
      .order("name").order("id").range(from, to)),
  ]);
  const uniqueClosures = [...new Map([...periodClosures, ...weekClosures].map((row) => [row.id, row])).values()];
  const allFacts = [];
  for (let index = 0; index < uniqueClosures.length; index += 60) {
    allFacts.push(...await getFactsForClosures(businessId, uniqueClosures.slice(index, index + 60)));
  }
  const facts = mergeHistoricalFacts(legacyFacts, allFacts);
  const shiftFacts: ShiftFact[] = [];
  for (let index = 0; index < periodClosures.length; index += 60) {
    const batch = periodClosures.slice(index, index + 60);
    const rows = await collectPages((from, to) => client.from("daily_shift_facts")
      .select("daily_closure_id, shift, sold_quantity, sales_cents, profit_cents")
      .eq("business_id", businessId).in("daily_closure_id", batch.map((item) => item.id))
      .order("daily_closure_id").order("shift").range(from, to));
    const dates = new Map(batch.map((item) => [item.id, item.operating_date]));
    shiftFacts.push(...rows.map((row) => ({ date: dates.get(row.daily_closure_id)!, shift: row.shift,
      soldQuantity: row.sold_quantity, salesCents: row.sales_cents, profitCents: row.profit_cents })));
  }
  const liveShiftDates = new Set(shiftFacts.map((row) => row.date));
  const courierNames = new Map(couriers.map((courier) => [courier.id, courier.name]));
  const toCourierRuns = (closing: (typeof periodClosures)[number]): CourierReportRun[] => {
    const parsed = closureSchema.shape.courierRuns.safeParse(closing.shift_payload?.courierRuns);
    if (!parsed.success) return [];
    return parsed.data.map((run) => ({
      date: closing.operating_date,
      courierId: run.courierId,
      courierName: courierNames.get(run.courierId) ?? "Repartidor no disponible",
      shift: run.shift,
      deliveredQuantity: run.deliveredQuantity,
      commissionCents: run.deliveredQuantity * run.commissionPerUnitCents + run.additionalCommissionCents,
      startTime: run.startTime,
      endTime: run.endTime,
    }));
  };
  const courierRuns = periodClosures.flatMap(toCourierRuns);
  const rankingRuns = weekClosures.filter((closing) => closing.operating_date >= week.currentStart).flatMap(toCourierRuns);
  for (const row of legacyShiftRows) {
    const shift = row.cells.C;
    if (!row.record_date || liveShiftDates.has(row.record_date) || (shift !== "AM" && shift !== "PM")) continue;
    const soldQuantity = Number(row.cells.G);
    const salesCents = Math.round(Number(row.cells.M) * 100);
    if (!Number.isSafeInteger(soldQuantity) || !Number.isSafeInteger(salesCents)) continue;
    shiftFacts.push({ date: row.record_date, shift, soldQuantity, salesCents, profitCents: null });
  }
  return {
    periodFacts: facts.filter((fact) => fact.date >= range.start && fact.date <= range.end),
    weeklyFacts: facts.filter((fact) => fact.date >= week.previousStart && fact.date <= week.currentEnd),
    shiftFacts,
    courierRuns,
    rankingRuns,
    pendingCreditCents: ledger.items.filter((item) => !item.collectionDateUnknown && item.saleDate >= range.start && item.saleDate <= range.end)
      .reduce((sum, item) => sum + item.remainingCents, 0),
  };
}
