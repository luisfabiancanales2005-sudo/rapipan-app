"use client";

import { DashboardContent } from "@/components/dashboard/dashboard";
import { MobileNav, Sidebar } from "@/components/layout/navigation";
import { useDemoSettings } from "@/components/preview/demo-settings";
import { allocateCents } from "@/lib/finance/settlement";
import type { ClosureFacts } from "@/lib/dashboard/metrics";

function example(date: string, salesCents: number, profitCents: number, soldQuantity: number, giftedQuantity = 0): ClosureFacts {
  return {
    id: date, date, purchasedQuantity: soldQuantity + giftedQuantity,
    soldQuantity, giftedQuantity, consumedQuantity: 0,
    salesCents, purchaseCostCents: salesCents - profitCents,
    commissionCents: 0, expensesCents: 0, profitCents,
    ownerProfitSharesCents: [Math.ceil(profitCents / 2), Math.floor(profitCents / 2)],
  };
}

const facts = [
  example("2026-09-14", 9000, 1800, 20),
  example("2026-09-16", 10000, 2100, 22),
  example("2026-09-18", 11000, 2200, 24),
  example("2026-09-21", 10000, 2000, 22),
  example("2026-09-23", 12000, 2400, 26),
  example("2026-09-25", 12150, 1950, 27, 3),
];

export default function DashboardPreviewPage() {
  const { configuration } = useDemoSettings();
  const owners = configuration.owners.map((owner) => ({ id: owner.id, weight: owner.profit_share_bps, sortOrder: owner.sort_order }));
  const personalizedFacts = facts.map((fact) => ({ ...fact, ownerProfitSharesCents: Object.values(allocateCents(fact.profitCents, owners)) }));
  return <div className="page-shell"><Sidebar /><main className="main-content"><DashboardContent facts={personalizedFacts} latestRecordedDate="2026-09-25" today="2026-09-25" preview /></main><MobileNav /></div>;
}
