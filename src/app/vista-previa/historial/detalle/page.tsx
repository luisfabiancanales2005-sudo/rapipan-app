import { ClosureDetailView } from "@/components/history/closure-detail-page";
import { MobileNav, Sidebar } from "@/components/layout/navigation";
import type { ClosureDetail } from "@/lib/supabase/queries/history";

const BUSINESS = "00000000-0000-4000-8000-000000000001";
const DAY = "00000000-0000-4000-8000-000000000041";
const PRODUCT = "00000000-0000-4000-8000-000000000021";
const COURIER = "00000000-0000-4000-8000-000000000031";
const FABIANA = "00000000-0000-4000-8000-000000000011";
const FABIAN = "00000000-0000-4000-8000-000000000012";

const detail = {
  closure: { id: DAY, business_id: BUSINESS, operating_date: "2026-09-25", status: "closed", opening_business_cash_cents: 0, reserved_business_cash_cents: 0, notes: "Cierre de demostración", updated_at: "2026-09-25T19:00:00Z", created_at: "2026-09-25T19:00:00Z", closed_at: "2026-09-25T19:00:00Z" },
  purchases: [{ id: "purchase-1", product_id: PRODUCT, quantity: 30, unit_cost_cents: 250, payer_type: "owner", owner_id: FABIANA }],
  sales: [{ id: "sale-1", product_id: PRODUCT, quantity: 27, unit_price_cents: 450 }],
  leftovers: [{ id: "leftover-1", product_id: PRODUCT, gifted_quantity: 2, consumed_quantity: 1 }],
  couriers: [{ id: "courier-run-1", product_id: PRODUCT, courier_id: COURIER, delivered_quantity: 27, commission_per_unit_cents: 100, additional_commission_cents: 0 }],
  expenses: [],
  credits: [{ id: "credit-1", reference: "Cliente del barrio", amount_cents: 900, status: "pending" }],
  settlements: [
    { id: "settlement-1", owner_id: FABIANA, profit_share_bps: 5000, economic_profit_share_cents: 975, capital_brought_forward_cents: 0, capital_contributed_cents: 7500, capital_reimbursed_cents: 7500, capital_pending_cents: 0, cash_profit_distributed_cents: 525, total_cash_due_cents: 8025 },
    { id: "settlement-2", owner_id: FABIAN, profit_share_bps: 5000, economic_profit_share_cents: 975, capital_brought_forward_cents: 0, capital_contributed_cents: 0, capital_reimbursed_cents: 0, capital_pending_cents: 0, cash_profit_distributed_cents: 525, total_cash_due_cents: 525 },
  ],
  products: [{ id: PRODUCT, name: "Pan Rapipan", default_cost_cents: 250, default_price_cents: 450 }],
  owners: [{ id: FABIANA, name: "Fabiana", profit_share_bps: 5000, sort_order: 1 }, { id: FABIAN, name: "Fabián", profit_share_bps: 5000, sort_order: 2 }],
  courierNames: [{ id: COURIER, name: "Repartidor principal", default_commission_cents: 100 }],
  collectionsCents: 0,
  payments: [],
} as unknown as ClosureDetail;

export default function DetailPreviewPage() {
  return <div className="page-shell"><Sidebar /><main className="main-content"><ClosureDetailView detail={detail} preview /></main><MobileNav /></div>;
}
