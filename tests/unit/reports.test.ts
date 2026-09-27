import { describe, expect, it } from "vitest";
import { buildReport, resolveReportRange, summarizeCouriers, summarizeShifts, summarizeWeekdayShifts } from "../../src/lib/reports/metrics";
import type { ClosureFacts } from "../../src/lib/dashboard/metrics";

function fact(date: string, salesCents: number, soldQuantity: number): ClosureFacts {
  return { id: date, date, purchasedQuantity: soldQuantity + 1, soldQuantity, giftedQuantity: 1,
    consumedQuantity: 0, salesCents, purchaseCostCents: 1000, commissionCents: 100,
    expensesCents: 0, profitCents: salesCents - 1100, ownerProfitSharesCents: [] };
}

describe("reports", () => {
  it("suma panes y comisiones por repartidor sin contar dos turnos como dos días", () => {
    const summary = summarizeCouriers([
      { date: "2026-09-26", courierId: "one", courierName: "Ana", shift: "AM", deliveredQuantity: 10, commissionCents: 1000 },
      { date: "2026-09-26", courierId: "one", courierName: "Ana", shift: "PM", deliveredQuantity: 8, commissionCents: 850 },
      { date: "2026-09-27", courierId: "one", courierName: "Ana", shift: "PM", deliveredQuantity: 5, commissionCents: 500 },
      { date: "2026-09-26", courierId: "two", courierName: "Beto", shift: "PM", deliveredQuantity: 12, commissionCents: 1200 },
    ]);
    expect(summary.map((row) => row.name)).toEqual(["Ana", "Beto"]);
    expect(summary[0]).toMatchObject({ deliveredQuantity: 23, commissionCents: 2350, operatedDays: 2,
      AM: { deliveredQuantity: 10, commissionCents: 1000 }, PM: { deliveredQuantity: 13, commissionCents: 1350 } });
    expect(summary[1]).toMatchObject({ deliveredQuantity: 12, commissionCents: 1200, operatedDays: 1 });
  });
  it("resolves full prior weeks and months without future dates", () => {
    expect(resolveReportRange({ preset: "last-week" }, "2026-09-25")).toEqual({ start: "2026-09-14", end: "2026-09-20" });
    expect(resolveReportRange({ preset: "last-month" }, "2026-09-25")).toEqual({ start: "2026-08-01", end: "2026-08-31" });
    expect(() => resolveReportRange({ preset: "custom", start: "2026-09-01", end: "2026-09-26" }, "2026-09-25")).toThrow();
    expect(() => resolveReportRange({ preset: "custom", start: "2026-02-30", end: "2026-03-01" }, "2026-09-25")).toThrow();
  });

  it("averages only closed days, retaining a zero-sale close", () => {
    const days = [fact("2026-09-21", 10000, 20), fact("2026-09-23", 0, 0)];
    const report = buildReport(days, days, { start: "2026-09-21", end: "2026-09-25" }, "2026-09-25");
    expect(report.total.operatedDays).toBe(2);
    expect(report.averages.salesCents).toBe(5000);
    expect(report.averages.priceCents).toBe(500);
    expect(report.weekdays[0].salesCents).toBe(10000);
    expect(report.weekdays[2].salesCents).toBe(0);
    expect(report.weekdays[1].salesCents).toBeNull();
  });

  it("requires equivalent operated weekdays for comparison", () => {
    const current = [fact("2026-09-21", 10000, 20), fact("2026-09-23", 12000, 24)];
    const matched = [fact("2026-09-14", 9000, 18), fact("2026-09-16", 10000, 20)];
    expect(buildReport(current, [...current, ...matched], { start: "2026-09-21", end: "2026-09-25" }, "2026-09-25").comparison.comparable).toBe(true);
    expect(buildReport(current, [...current, matched[0]], { start: "2026-09-21", end: "2026-09-25" }, "2026-09-25").comparison.comparable).toBe(false);
  });

  it("keeps two shifts inside one operated date and preserves a zero-sale AM", () => {
    const daily = buildReport([fact("2026-09-25", 9000, 20)], [], { start: "2026-09-25", end: "2026-09-25" }, "2026-09-25");
    const shifts = summarizeShifts([
      { date: "2026-09-25", shift: "AM", soldQuantity: 0, salesCents: 0, profitCents: -2500 },
      { date: "2026-09-25", shift: "PM", soldQuantity: 20, salesCents: 9000, profitCents: 4000 },
    ]);
    expect(daily.total.operatedDays).toBe(1);
    expect(shifts.map((item) => [item.operatedShifts, item.salesCents])).toEqual([[1, 0], [1, 9000]]);
  });

  it("does not invent per-shift profit when historical expenses lack a shift", () => {
    const [am] = summarizeShifts([
      { date: "2026-08-26", shift: "AM", soldQuantity: 27, salesCents: 13050, profitCents: null },
    ]);
    expect(am.salesCents).toBe(13050);
    expect(am.profitCents).toBeNull();
  });

  it("compares weekdays separately by registered shift, including zero sales but not missing shifts", () => {
    const summary = summarizeWeekdayShifts([
      { date: "2026-09-14", shift: "AM", soldQuantity: 2, salesCents: 1000, profitCents: null },
      { date: "2026-09-21", shift: "AM", soldQuantity: 4, salesCents: 2000, profitCents: null },
      { date: "2026-09-21", shift: "AM", soldQuantity: 2, salesCents: 1000, profitCents: null },
      { date: "2026-09-21", shift: "PM", soldQuantity: 0, salesCents: 0, profitCents: null },
      { date: "2026-09-23", shift: "PM", soldQuantity: 10, salesCents: 5000, profitCents: null },
      { date: "2026-09-28", shift: "AM", soldQuantity: 100, salesCents: 50000, profitCents: null },
    ], { start: "2026-09-14", end: "2026-09-25" });
    expect(summary[0]).toEqual({ index: 0,
      AM: { count: 2, salesCents: 2000, soldQuantity: 4 },
      PM: { count: 1, salesCents: 0, soldQuantity: 0 } });
    expect(summary[1].AM).toEqual({ count: 0, salesCents: null, soldQuantity: null });
    expect(summary[2].PM).toEqual({ count: 1, salesCents: 5000, soldQuantity: 10 });
  });
});
