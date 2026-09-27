import { getSupabaseClient } from "../client";
import { collectPages } from "./dashboard";

export async function getConfiguration(businessId: string) {
  const client = getSupabaseClient();
  const [business, defaults, owners, products, couriers] = await Promise.all([
    client.from("businesses").select("id, name, updated_at").eq("id", businessId).single(),
    client.from("business_settings").select("usual_cost_cents, usual_price_cents, usual_courier_commission_cents").eq("business_id", businessId).single(),
    collectPages((from, to) => client.from("owners").select("id, name, profit_share_bps, active, sort_order").eq("business_id", businessId).order("sort_order").range(from, to)),
    collectPages((from, to) => client.from("products").select("id, name, active, default_cost_cents, default_price_cents").eq("business_id", businessId).order("name").order("id").range(from, to)),
    collectPages((from, to) => client.from("couriers").select("id, name, active, default_commission_cents").eq("business_id", businessId).order("name").order("id").range(from, to)),
  ]);
  if (business.error) throw business.error;
  if (defaults.error) throw defaults.error;
  return { business: business.data, defaults: defaults.data, owners, products, couriers };
}

export type Configuration = Awaited<ReturnType<typeof getConfiguration>>;
