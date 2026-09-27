import { HistoryView, type PageData } from "@/components/history/history-page";
import { MobileNav, Sidebar } from "@/components/layout/navigation";

const data: PageData = {
  items: [
    { id: "demo-25", date: "2026-09-25", updatedAt: "2026-09-25T18:00:00Z", purchasedQuantity: 30, soldQuantity: 27, giftedQuantity: 2, consumedQuantity: 1, salesCents: 12150, purchaseCostCents: 7500, commissionCents: 2700, expensesCents: 0, profitCents: 1950, ownerProfitSharesCents: [975, 975] },
    { id: "demo-23", date: "2026-09-23", updatedAt: "2026-09-23T18:00:00Z", purchasedQuantity: 28, soldQuantity: 26, giftedQuantity: 2, consumedQuantity: 0, salesCents: 11700, purchaseCostCents: 7000, commissionCents: 2600, expensesCents: 0, profitCents: 2100, ownerProfitSharesCents: [1050, 1050] },
    { id: "demo-21", date: "2026-09-21", updatedAt: "2026-09-21T18:00:00Z", purchasedQuantity: 20, soldQuantity: 0, giftedQuantity: 20, consumedQuantity: 0, salesCents: 0, purchaseCostCents: 5000, commissionCents: 0, expensesCents: 0, profitCents: -5000, ownerProfitSharesCents: [-2500, -2500] },
  ],
  hasMore: false,
};

export default function HistoryPreviewPage() {
  return <div className="page-shell"><Sidebar /><main className="main-content"><HistoryView data={data} preview /></main><MobileNav /></div>;
}
