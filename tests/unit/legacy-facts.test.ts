import { describe, expect, it } from "vitest";
import { mergeHistoricalFacts } from "@/lib/supabase/queries/legacy-facts";
import type { ClosureFacts } from "@/lib/dashboard/metrics";

function fact(date: string, id: string, salesCents: number): ClosureFacts {
  return { id, date, purchasedQuantity: 1, soldQuantity: 1,
    giftedQuantity: 0, consumedQuantity: 0, salesCents,
    purchaseCostCents: 250, commissionCents: 0, expensesCents: 0,
    profitCents: salesCents - 250, ownerProfitSharesCents: [] };
}

describe("historical report facts", () => {
  it("includes every legacy date once and lets an edited normal close replace the same day", () => {
    const result = mergeHistoricalFacts(
      [fact("2026-09-03", "legacy-03", 450), fact("2026-09-04", "legacy-04", 900)],
      [fact("2026-09-04", "close-04", 850)],
    );
    expect(result.map((item) => item.date)).toEqual(["2026-09-03", "2026-09-04"]);
    expect(result[1].id).toBe("close-04");
    expect(result.reduce((sum, item) => sum + item.salesCents, 0)).toBe(1300);
  });
});
