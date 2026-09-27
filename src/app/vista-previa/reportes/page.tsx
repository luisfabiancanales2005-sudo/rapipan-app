"use client";

import { useState } from "react";
import { MobileNav, Sidebar } from "@/components/layout/navigation";
import { ReportsView, type ReportData } from "@/components/reports/reports-page";
import type { ClosureFacts } from "@/lib/dashboard/metrics";
import { resolveReportRange, type ReportSelection } from "@/lib/reports/metrics";

const today = "2026-09-25";
function day(date: string, sold: number, sales: number, profit: number, gifted = 0, consumed = 0): ClosureFacts {
  return { id: date, date, purchasedQuantity: sold + gifted + consumed, soldQuantity: sold,
    giftedQuantity: gifted, consumedQuantity: consumed, salesCents: sales, purchaseCostCents: sales - profit - sold * 100,
    commissionCents: sold * 100, expensesCents: 0, profitCents: profit, ownerProfitSharesCents: [] };
}
const facts = [
  day("2026-08-25", 19, 8500, 1700, 1), day("2026-08-28", 22, 9900, 1900, 2),
  day("2026-09-01", 20, 9000, 1800), day("2026-09-03", 0, 0, -300, 1, 2),
  day("2026-09-07", 23, 10350, 2150), day("2026-09-09", 24, 10800, 2200, 1),
  day("2026-09-14", 20, 9000, 1800), day("2026-09-16", 22, 10000, 2100),
  day("2026-09-18", 24, 11000, 2200), day("2026-09-21", 22, 10000, 2000),
  day("2026-09-23", 26, 12000, 2400), day("2026-09-25", 27, 12150, 1950, 2, 1),
];

export default function ReportsPreviewPage() {
  const [selection, setSelection] = useState<ReportSelection>({ preset: "this-month" });
  const range = resolveReportRange(selection, today);
  const data: ReportData = {
    periodFacts: facts.filter((fact) => fact.date >= range.start && fact.date <= range.end),
    weeklyFacts: facts,
    shiftFacts: facts.filter((fact) => fact.date >= range.start && fact.date <= range.end).flatMap((fact) => {
      const morningSales = fact.date === "2026-09-25" ? 0 : Math.floor(fact.salesCents / 2);
      const morningUnits = fact.date === "2026-09-25" ? 0 : Math.floor(fact.soldQuantity / 2);
      const morningProfit = fact.date === "2026-09-25" ? -750 : Math.floor(fact.profitCents / 2);
      return [
        { date: fact.date, shift: "AM" as const, soldQuantity: morningUnits, salesCents: morningSales, profitCents: morningProfit },
        { date: fact.date, shift: "PM" as const, soldQuantity: fact.soldQuantity - morningUnits,
          salesCents: fact.salesCents - morningSales, profitCents: fact.profitCents - morningProfit },
      ];
    }),
    courierRuns: [
      { date: "2026-09-21", courierId: "morning", courierName: "Repartidor mañana", shift: "AM" as const, deliveredQuantity: 10, commissionCents: 1000 },
      { date: "2026-09-21", courierId: "afternoon", courierName: "Repartidor tarde", shift: "PM" as const, deliveredQuantity: 12, commissionCents: 1200 },
      { date: "2026-09-23", courierId: "morning", courierName: "Repartidor mañana", shift: "AM" as const, deliveredQuantity: 12, commissionCents: 1200 },
      { date: "2026-09-23", courierId: "afternoon", courierName: "Repartidor tarde", shift: "PM" as const, deliveredQuantity: 14, commissionCents: 1400 },
      { date: "2026-09-25", courierId: "afternoon", courierName: "Repartidor tarde", shift: "PM" as const, deliveredQuantity: 27, commissionCents: 2700 },
    ].filter((run) => run.date >= range.start && run.date <= range.end),
    pendingCreditCents: facts.some((fact) => fact.date >= range.start && fact.date <= range.end) ? 900 : 0,
  };
  return <div className="page-shell"><Sidebar /><main className="main-content"><ReportsView data={data} today={today} selection={selection} preview onSelectionChange={setSelection} /></main><MobileNav /></div>;
}
