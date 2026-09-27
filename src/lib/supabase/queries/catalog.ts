import { getSupabaseClient } from "../client";

export async function listActiveProducts(businessId: string) {
  const { data, error } = await getSupabaseClient()
    .from("products")
    .select("id, name, default_cost_cents, default_price_cents")
    .eq("business_id", businessId)
    .eq("active", true)
    .order("name");
  if (error) throw error;
  return data;
}

export async function listActiveCouriers(businessId: string) {
  const { data, error } = await getSupabaseClient()
    .from("couriers")
    .select("id, name, default_commission_cents")
    .eq("business_id", businessId)
    .eq("active", true)
    .order("name");
  if (error) throw error;
  return data;
}

export async function listOwners(businessId: string) {
  const { data, error } = await getSupabaseClient()
    .from("owners")
    .select("id, name, profit_share_bps, sort_order")
    .eq("business_id", businessId)
    .eq("active", true)
    .order("sort_order");
  if (error) throw error;
  return data;
}
