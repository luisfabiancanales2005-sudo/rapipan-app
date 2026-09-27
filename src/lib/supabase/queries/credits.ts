import { getSupabaseClient } from "../client";
import { collectPages } from "./dashboard";

function sourceAmountCents(value: unknown): number {
  const cents = Number(value) * 100;
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new Error("Importe histórico de crédito inválido.");
  return cents;
}

export async function getCreditLedger(businessId: string) {
  const client = getSupabaseClient();
  const [credits, payments, attestations, sourceResult] = await Promise.all([
    collectPages((from, to) => client.from("credits").select("id, daily_closure_id, reference, amount_cents, status, created_at")
      .eq("business_id", businessId).order("id").range(from, to)),
    collectPages((from, to) => client.from("credit_payments").select("id, credit_id, payment_date, amount_cents")
      .eq("business_id", businessId).order("id").range(from, to)),
    collectPages((from, to) => client.from("legacy_credit_attestations").select("credit_row,payment_date,amount_cents")
      .eq("business_id", businessId).order("credit_row").range(from, to)),
    client.from("legacy_source_rows").select("source_row,record_date,cells")
      .eq("business_id", businessId).eq("sheet_name", "Creditos_Clientes").order("source_row").limit(100),
  ]);
  if (sourceResult.error) throw sourceResult.error;
  const sourceRows = sourceResult.data ?? [];
  const attestationByRow = new Map(attestations.map((item) => [item.credit_row, item]));
  const assumedSaleDates = new Set(sourceRows.filter((row) => attestationByRow.has(row.source_row))
    .map((row) => row.record_date).filter((day): day is string => Boolean(day)));
  const closureIds = [...new Set(credits.map((credit) => credit.daily_closure_id))];
  const closureDates = new Map<string, string>();
  for (let offset = 0; offset < closureIds.length; offset += 100) {
    const { data, error } = await client.from("daily_closures").select("id, operating_date")
      .eq("business_id", businessId).in("id", closureIds.slice(offset, offset + 100));
    if (error) throw error;
    for (const closure of data ?? []) closureDates.set(closure.id, closure.operating_date);
  }
  const paidByCredit = new Map<string, number>();
  const lastPaymentByCredit = new Map<string, string>();
  for (const payment of payments) {
    paidByCredit.set(payment.credit_id, (paidByCredit.get(payment.credit_id) ?? 0) + payment.amount_cents);
    const previous = lastPaymentByCredit.get(payment.credit_id);
    if (!previous || payment.payment_date > previous) lastPaymentByCredit.set(payment.credit_id, payment.payment_date);
  }
  const normalItems = credits.map((credit) => {
    const saleDate = closureDates.get(credit.daily_closure_id) ?? "";
    return {
      ...credit, saleDate,
      paidCents: paidByCredit.get(credit.id) ?? 0,
      remainingCents: Math.max(0, credit.amount_cents - (paidByCredit.get(credit.id) ?? 0)),
      lastPaymentDate: lastPaymentByCredit.get(credit.id) ?? null,
      collectionDateUnknown: false,
      assumedPaymentDate: assumedSaleDates.has(saleDate),
    };
  });

  // The Excel import stores all five credit sales as historical source rows.
  // Never duplicate a row once it has a corresponding editable closure.
  const normalSaleDates = new Set(normalItems.map((item) => item.saleDate));
  const historicalItems = sourceRows.filter((row) => !normalSaleDates.has(row.record_date ?? "")).map((row) => {
    if (!row.record_date) throw new Error("Crédito histórico sin fecha de venta.");
    const amount = sourceAmountCents(row.cells.E);
    const attestation = attestationByRow.get(row.source_row);
    const paymentDate = attestation?.payment_date ?? (typeof row.cells.G === "string" ? row.cells.G : null);
    if (!paymentDate || (attestation && attestation.amount_cents !== amount)) {
      throw new Error("Cobro histórico sin fecha o importe coincidente.");
    }
    return {
      id: `legacy-credit-${row.source_row}`,
      daily_closure_id: `legacy-${row.record_date}`,
      reference: String(row.cells.B ?? "Cliente no especificado"),
      amount_cents: amount,
      status: "paid" as const,
      created_at: "", // The source workbook has no credit-creation timestamp.
      saleDate: row.record_date,
      paidCents: amount,
      remainingCents: 0,
      lastPaymentDate: paymentDate,
      collectionDateUnknown: false,
      assumedPaymentDate: Boolean(attestation),
    };
  });
  const historicalPayments = historicalItems.map((item) => ({
    id: `legacy-payment-${item.id}`,
    credit_id: item.id,
    payment_date: item.lastPaymentDate,
    amount_cents: item.amount_cents,
  }));
  return {
    items: [...normalItems, ...historicalItems].sort((a, b) => b.saleDate.localeCompare(a.saleDate)),
    payments: [...payments, ...historicalPayments].sort((a, b) => b.payment_date.localeCompare(a.payment_date)),
  };
}
