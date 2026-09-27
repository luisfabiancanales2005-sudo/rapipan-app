import { ConfigurationView } from "@/components/configuration/configuration-page";
import { MobileNav, Sidebar } from "@/components/layout/navigation";
import type { Configuration } from "@/lib/supabase/queries/configuration";

const config: Configuration = {
  business: { id: "00000000-0000-4000-8000-000000000001", name: "Rapipan", updated_at: "2026-09-25T12:00:00Z" },
  defaults: { usual_cost_cents: 250, usual_price_cents: 450, usual_courier_commission_cents: 100 },
  owners: [
    { id: "00000000-0000-4000-8000-000000000011", name: "Fabiana", profit_share_bps: 5000, active: true, sort_order: 1 },
    { id: "00000000-0000-4000-8000-000000000012", name: "Fabián", profit_share_bps: 5000, active: true, sort_order: 2 },
  ],
  products: [{ id: "00000000-0000-4000-8000-000000000021", name: "Pan Rapipan", active: true, default_cost_cents: 250, default_price_cents: 450 }],
  couriers: [{ id: "00000000-0000-4000-8000-000000000031", name: "Repartidor principal", active: true, default_commission_cents: 100 }],
};

export default function ConfigurationPreviewPage() {
  return <div className="page-shell"><Sidebar /><main className="main-content"><ConfigurationView config={config} preview /></main><MobileNav /></div>;
}
