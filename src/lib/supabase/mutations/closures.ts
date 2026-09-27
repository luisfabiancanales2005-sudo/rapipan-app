import type { ClosureInput } from "@/lib/finance/types";
import { getSupabaseClient } from "../client";

export async function createDailyClosure(input: ClosureInput): Promise<string> {
  const { data, error } = await getSupabaseClient().rpc("create_daily_closure_v2", {
    p_payload: input as unknown as Record<string, unknown>,
  });
  if (error) throw error;
  return data;
}

export async function updateDailyClosure(id: string, expectedUpdatedAt: string, input: ClosureInput, preserveCredits = false): Promise<string> {
  const { data, error } = await getSupabaseClient().rpc("update_daily_closure_v2", {
    p_closure_id: id,
    p_expected_updated_at: expectedUpdatedAt,
    p_payload: { ...input, preserveCredits } as unknown as Record<string, unknown>,
  });
  if (error) throw error;
  return data;
}

export async function deleteDailyClosure(id: string, expectedUpdatedAt: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc("delete_daily_closure", {
    p_closure_id: id,
    p_expected_updated_at: expectedUpdatedAt,
  });
  if (error) throw error;
}
