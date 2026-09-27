import type { ConfigurationPayload } from "../../validation/configuration";
import { getSupabaseClient } from "../client";

export async function saveConfiguration(expectedUpdatedAt: string, payload: ConfigurationPayload) {
  const { data, error } = await getSupabaseClient().rpc("save_business_configuration", {
    p_expected_updated_at: expectedUpdatedAt,
    p_payload: payload as unknown as Record<string, unknown>,
  });
  if (error) throw error;
  return data;
}
