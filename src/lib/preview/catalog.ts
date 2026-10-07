import type { DailyCloseCatalog } from "../../components/daily-close/daily-close-form";

export const previewCatalog: DailyCloseCatalog = {
  products: [
    { id: "00000000-0000-4000-8000-000000000021", name: "Producto 1", default_cost_cents: 250, default_price_cents: 450 },
    { id: "00000000-0000-4000-8000-000000000022", name: "Producto 2", default_cost_cents: 300, default_price_cents: 550 },
    { id: "00000000-0000-4000-8000-000000000023", name: "Producto 3", default_cost_cents: 400, default_price_cents: 700 },
  ],
  couriers: [
    { id: "00000000-0000-4000-8000-000000000031", name: "Repartidor mañana", default_commission_cents: 100 },
    { id: "00000000-0000-4000-8000-000000000032", name: "Repartidor tarde", default_commission_cents: 100 },
  ],
  owners: [
    { id: "00000000-0000-4000-8000-000000000011", name: "Socio 1", shareBps: 5000, sortOrder: 1, priorCapitalCents: 0 },
    { id: "00000000-0000-4000-8000-000000000012", name: "Socio 2", shareBps: 5000, sortOrder: 2, priorCapitalCents: 0 },
  ],
  defaults: { usual_cost_cents: 250, usual_price_cents: 450, usual_courier_commission_cents: 100 },
};
