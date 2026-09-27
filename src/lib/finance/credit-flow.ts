export type PaymentOnDate = { paymentDate: string; amountCents: number };

/** Payments after the prior closed day belong to the next close, retaining their actual dates. */
export function collectionsForClose(payments: PaymentOnDate[], previousCloseDate: string | null, closeDate: string): number {
  return payments.reduce((sum, payment) =>
    payment.paymentDate <= closeDate && (previousCloseDate === null || payment.paymentDate > previousCloseDate)
      ? sum + payment.amountCents : sum, 0);
}

export function groupCollectionsByDate(payments: PaymentOnDate[]) {
  const result = new Map<string, number>();
  for (const payment of payments) result.set(payment.paymentDate, (result.get(payment.paymentDate) ?? 0) + payment.amountCents);
  return [...result].sort((a, b) => b[0].localeCompare(a[0]));
}
