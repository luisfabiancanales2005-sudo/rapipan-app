import { CreditsView, type CreditLedger } from "@/components/credits/credits-page";
import { MobileNav, Sidebar } from "@/components/layout/navigation";

const ledger: CreditLedger = {
  items: [
    { id: "demo-1", daily_closure_id: "day-1", reference: "Cliente del barrio", amount_cents: 900, status: "pending", created_at: "2026-09-18T12:00:00Z", saleDate: "2026-09-18", paidCents: 0, remainingCents: 900, lastPaymentDate: null, collectionDateUnknown: false, assumedPaymentDate: false },
    { id: "demo-2", daily_closure_id: "day-2", reference: "Pedido de oficina", amount_cents: 1800, status: "pending", created_at: "2026-09-21T12:00:00Z", saleDate: "2026-09-21", paidCents: 0, remainingCents: 1800, lastPaymentDate: null, collectionDateUnknown: false, assumedPaymentDate: false },
    { id: "demo-3", daily_closure_id: "day-3", reference: "Cliente frecuente", amount_cents: 1200, status: "paid", created_at: "2026-09-15T12:00:00Z", saleDate: "2026-09-15", paidCents: 1200, remainingCents: 0, lastPaymentDate: "2026-09-22", collectionDateUnknown: false, assumedPaymentDate: false },
  ],
  payments: [{ id: "payment-1", credit_id: "demo-3", payment_date: "2026-09-22", amount_cents: 1200 }],
};

export default function CreditsPreviewPage() {
  return <div className="page-shell"><Sidebar /><main className="main-content"><CreditsView ledger={ledger} preview /></main><MobileNav /></div>;
}
