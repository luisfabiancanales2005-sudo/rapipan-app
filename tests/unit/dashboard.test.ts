import { describe, expect, it } from "vitest";
import { addDays, mondayOf, monthStart, todayInLima } from "../../src/lib/dates/lima";
import { buildDashboard, comparableChange, makeClosureFacts, summarize, type ClosureFacts } from "../../src/lib/dashboard/metrics";

function day(date: string, salesCents = 0, profitCents = 0, soldQuantity = 0): ClosureFacts {
  return {
    id: date, date, purchasedQuantity: soldQuantity, soldQuantity,
    giftedQuantity: 0, consumedQuantity: 0,
    salesCents, purchaseCostCents: salesCents - profitCents,
    commissionCents: 0, expensesCents: 0, profitCents,
    ownerProfitSharesCents: [Math.ceil(profitCents / 2), Math.floor(profitCents / 2)],
  };
}

describe("fechas operativas", () => {
  it("usa días calendario y semana lunes-domingo sin desfase de zona", () => {
    expect(todayInLima(new Date("2026-09-25T02:00:00Z"))).toBe("2026-09-24");
    expect(mondayOf("2026-09-27")).toBe("2026-09-21");
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(monthStart("2026-10-31")).toBe("2026-10-01");
  });
});

describe("dashboard real", () => {
  it("no convierte fechas sin cierre en ventas cero", () => {
    const report = buildDashboard([], "2026-09-25");
    expect(report.todayClosure).toBeNull();
    expect(report.currentSummary.operatedDays).toBe(0);
    expect(report.chart("7d")).toHaveLength(7);
    expect(report.chart("7d").every((point) => point.salesCents === null && !point.operated)).toBe(true);
    expect(report.insights).toEqual([]);
  });

  it("cuenta un cierre de cero ventas como día operado, no como ausencia", () => {
    const report = buildDashboard([day("2026-09-25", 0, -7500)], "2026-09-25");
    expect(report.todayClosure?.salesCents).toBe(0);
    expect(report.currentSummary.operatedDays).toBe(1);
    expect(report.currentSummary.marginBps).toBeNull();
    expect(report.chart("7d").at(-1)).toMatchObject({ salesCents: 0, operated: true });
    expect(report.chart("7d").at(-2)).toMatchObject({ salesCents: null, operated: false });
    expect(report.weeksComparable).toBe(false);
  });

  it("deriva utilidad y unidades de líneas reales por cierre", () => {
    const facts = makeClosureFacts([{ id: "one", operating_date: "2026-09-25" }], {
      purchases: [{ daily_closure_id: "one", quantity: 30, unit_cost_cents: 250 }],
      sales: [{ daily_closure_id: "one", quantity: 27, unit_price_cents: 450 }],
      leftovers: [{ daily_closure_id: "one", gifted_quantity: 2, consumed_quantity: 1 }],
      couriers: [{ daily_closure_id: "one", delivered_quantity: 27, commission_per_unit_cents: 100, additional_commission_cents: 0 }],
      expenses: [],
      settlements: [
        { daily_closure_id: "one", economic_profit_share_cents: 975, profit_share_bps: 5000 },
        { daily_closure_id: "one", economic_profit_share_cents: 975, profit_share_bps: 5000 },
      ],
    });
    expect(facts[0]).toMatchObject({ salesCents: 12150, purchaseCostCents: 7500, commissionCents: 2700, profitCents: 1950, soldQuantity: 27, giftedQuantity: 2, consumedQuantity: 1 });
    expect(facts[0].ownerProfitSharesCents).toEqual([975, 975]);
  });

  it("con tres días genera solo conclusiones sustentadas", () => {
    const days = [day("2026-09-21", 5000, 1000, 10), day("2026-09-23", 7000, 2000, 14), day("2026-09-25", 6000, 1500, 12)];
    days[1].giftedQuantity = 2;
    const report = buildDashboard(days, "2026-09-25");
    expect(report.currentSummary.operatedDays).toBe(3);
    expect(report.weeksComparable).toBe(false);
    expect(report.insights.some((insight) => insight.includes("regalados o consumidos"))).toBe(true);
    expect(report.insights.some((insight) => insight.includes("día de mayor venta"))).toBe(true);
    expect(report.insights.some((insight) => insight.includes("semana anterior"))).toBe(false);
  });

  it("compara semanas parciales solo con los mismos días operados", () => {
    const days = [
      day("2026-09-14", 1000, 200, 5), day("2026-09-15", 1000, 200, 5),
      day("2026-09-21", 1500, 300, 6), day("2026-09-22", 1500, 300, 6),
    ];
    const report = buildDashboard(days, "2026-09-25");
    expect(report.weeksComparable).toBe(true);
    expect(report.currentSummary.salesCents).toBe(3000);
    expect(report.previousSummary.salesCents).toBe(2000);
    expect(comparableChange(3000, 2000)).toBe(50);
    expect(report.insights[0]).toContain("50.0%");
    const incomplete = buildDashboard(days.slice(1), "2026-09-25");
    expect(incomplete.weeksComparable).toBe(false);
  });

  it("maneja un mes entero y registros de meses anteriores sin mezclarlos", () => {
    const october = Array.from({ length: 31 }, (_, index) => day(addDays("2026-10-01", index), 1000, 200, 2));
    const report = buildDashboard([day("2026-08-24", 9999, 1), ...october], "2026-10-31");
    expect(report.chart("month")).toHaveLength(31);
    expect(report.chart("30d")).toHaveLength(30);
    expect(report.chart("7d")).toHaveLength(7);
    expect(report.latestDate).toBe("2026-10-31");
    expect(summarize(october).salesCents).toBe(31000);
    expect(report.chart("month")[0].date).toBe("2026-10-01");
  });

  it("no muestra porcentajes con base cero o utilidad negativa", () => {
    expect(comparableChange(100, 0)).toBeNull();
    expect(comparableChange(-100, 100)).toBeNull();
    expect(comparableChange(0, 100)).toBe(-100);
  });
});
