import { getSupabaseClient } from "../client";

export async function getBusinessContext(userId: string) {
  const client = getSupabaseClient();
  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("id, business_id, display_name")
    .eq("id", userId)
    .single();

  if (profileError) throw profileError;

  const { data: business, error: businessError } = await client
    .from("businesses")
    .select("id, name, timezone, currency_code")
    .eq("id", profile.business_id)
    .single();

  if (businessError) throw businessError;
  return { profile, business };
}

export async function getBusinessDefaults(businessId: string) {
  const { data, error } = await getSupabaseClient()
    .from("business_settings")
    .select("business_id, usual_cost_cents, usual_price_cents, usual_courier_commission_cents")
    .eq("business_id", businessId)
    .single();
  if (error) throw error;
  return data;
}
