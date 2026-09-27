import { getSupabaseClient } from "../client";

export async function recordCreditPayment(creditId: string, paymentDate: string): Promise<string> {
  const { data, error } = await getSupabaseClient().rpc("record_credit_payment", {
    p_credit_id: creditId, p_payment_date: paymentDate,
  });
  if (error) throw error;
  return data;
}
