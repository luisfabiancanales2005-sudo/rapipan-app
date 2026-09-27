import { getSupabaseClient } from "../client";

export async function listRecentClosures(businessId: string, limit = 30) {
  const { data, error } = await getSupabaseClient()
    .from("daily_closures")
    .select("id, operating_date, status, closed_at")
    .eq("business_id", businessId)
    .order("operating_date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function getLatestCapitalByOwner(businessId: string) {
  const client = getSupabaseClient();
  const { data: latestClosure, error: closureError } = await client
    .from("daily_closures")
    .select("id")
    .eq("business_id", businessId)
    .eq("status", "closed")
    .order("operating_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (closureError) throw closureError;
  if (!latestClosure) return new Map<string, number>();
  const { data, error } = await client
    .from("settlements")
    .select("owner_id, capital_pending_cents")
    .eq("business_id", businessId)
    .eq("daily_closure_id", latestClosure.id);
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.owner_id, row.capital_pending_cents]));
}
