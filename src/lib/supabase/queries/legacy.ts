import { getSupabaseClient } from "../client";

export async function getLegacyArchive(businessId: string) {
  const client = getSupabaseClient();
  const [sourceResult, attestationResult, dailyResult] = await Promise.all([
    client.from("legacy_source_rows").select("sheet_name,source_row,record_date,cells,calculated_columns,correction")
      .eq("business_id", businessId).order("source_row").limit(500),
    client.from("legacy_credit_attestations").select("credit_row,status,payment_date,amount_cents")
      .eq("business_id", businessId).limit(100),
    client.from("legacy_daily_facts").select("operating_date,source_rows,purchase_cost_cents,profit_cents,fabiana_profit_cents,fabian_profit_cents,fabiana_capital_cents,fabian_capital_cents,fabiana_expenses_paid_cents,fabian_expenses_paid_cents,capital_evidence,cash_settlement_status")
      .eq("business_id", businessId).order("operating_date").limit(100),
  ]);
  if (sourceResult.error) throw sourceResult.error;
  if (attestationResult.error) throw attestationResult.error;
  if (dailyResult.error) throw dailyResult.error;
  return { rows: sourceResult.data ?? [], attestations: attestationResult.data ?? [], dailyFacts: dailyResult.data ?? [] };
}
