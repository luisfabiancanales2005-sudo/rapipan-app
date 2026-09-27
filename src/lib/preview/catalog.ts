import type { DailyCloseCatalog } from "../../components/daily-close/daily-close-form";

export const previewCatalog: DailyCloseCatalog = {
  products: [{ id: "00000000-0000-4000-8000-000000000021", name: "Pan Rapipan", default_cost_cents: 250, default_price_cents: 450 }],
  couriers: [
    { id: "00000000-0000-4000-8000-000000000031", name: "Repartidor mañana", default_commission_cents: 100 },
    { id: "00000000-0000-4000-8000-000000000032", name: "Repartidor tarde", default_commission_cents: 100 },
  ],
  owners: [
    { id: "00000000-0000-4000-8000-000000000011", name: "Fabiana", shareBps: 5000, sortOrder: 1, priorCapitalCents: 0 },
    { id: "00000000-0000-4000-8000-000000000012", name: "Fabián", shareBps: 5000, sortOrder: 2, priorCapitalCents: 0 },
  ],
  defaults: { usual_cost_cents: 250, usual_price_cents: 450, usual_courier_commission_cents: 100 },
};
