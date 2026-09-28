import type { ClosureInput, Shift } from "./types";

export function calculateShiftMetrics(input: ClosureInput) {
  return (["AM", "PM"] as const).map((shift: Shift) => {
    const purchases = input.purchases.filter((line) => line.shift === shift);
    const sales = input.sales.filter((line) => line.shift === shift);
    const leftovers = input.leftovers.filter((line) => line.shift === shift);
    const couriers = input.courierRuns.filter((line) => line.shift === shift);
    const expenses = input.expenses.filter((line) => line.shift === shift);
    const salesCents = sales.reduce((sum, line) => sum + line.quantity * line.unitPriceCents, 0);
    const purchaseCostCents = purchases.reduce((sum, line) => sum + line.quantity * line.unitCostCents, 0);
    const commissionCents = couriers.reduce((sum, line) => sum + line.deliveredQuantity * line.commissionPerUnitCents + line.additionalCommissionCents, 0);
    const expensesCents = expenses.reduce((sum, line) => sum + line.amountCents, 0);
    return {
      shift,
      operated: purchases.length > 0 || sales.length > 0 || leftovers.some((line) => line.giftedQuantity + line.consumedQuantity > 0),
      purchasedQuantity: purchases.reduce((sum, line) => sum + line.quantity, 0),
      soldQuantity: sales.reduce((sum, line) => sum + line.quantity, 0),
      giftedQuantity: leftovers.reduce((sum, line) => sum + line.giftedQuantity, 0),
      consumedQuantity: leftovers.reduce((sum, line) => sum + line.consumedQuantity, 0),
      salesCents, purchaseCostCents, commissionCents, expensesCents,
      profitCents: calculateProfit(salesCents, purchaseCostCents, commissionCents, expensesCents),
    };
  });
}

export function calculateProfit(salesCents: number, costCents: number, commissionCents: number, expensesCents: number): number {
  return salesCents - costCents - commissionCents - expensesCents;
}

/** Margin in basis points; null for a day without sales. */
export function calculateMargin(profitCents: number, salesCents: number): number | null {
  if (salesCents === 0) return null;
  return Number((BigInt(profitCents) * 10000n) / BigInt(salesCents));
}

export function calculateClosure(input: ClosureInput) {
  const purchasedQuantity = input.purchases.reduce((sum, line) => sum + line.quantity, 0);
  const soldQuantity = input.sales.reduce((sum, line) => sum + line.quantity, 0);
  const giftedQuantity = input.leftovers.reduce((sum, line) => sum + line.giftedQuantity, 0);
  const consumedQuantity = input.leftovers.reduce((sum, line) => sum + line.consumedQuantity, 0);
  const purchaseCostCents = input.purchases.reduce((sum, line) => sum + line.quantity * line.unitCostCents, 0);
  const salesCents = input.sales.reduce((sum, line) => sum + line.quantity * line.unitPriceCents, 0);
  const commissionCents = input.courierRuns.reduce(
    (sum, line) => sum + line.deliveredQuantity * line.commissionPerUnitCents + line.additionalCommissionCents, 0,
  );
  const expensesCents = input.expenses.reduce((sum, line) => sum + line.amountCents, 0);
  const creditCents = input.credit?.amountCents ?? 0;
  const creditCollectionsCents = input.creditCollectionsCents ?? 0;
  const cashFromSalesCents = salesCents - creditCents;
  const businessPaidPurchasesCents = input.businessPaidPurchasesCents ?? 0;
  const businessPaidExpensesCents = input.expenses
    .filter((line) => line.payer.type === "business_cash")
    .reduce((sum, line) => sum + line.amountCents, 0);
  const economicProfitCents = calculateProfit(salesCents, purchaseCostCents, commissionCents, expensesCents);

  const productIds = new Set([
    ...input.purchases.map((line) => line.productId),
    ...input.sales.map((line) => line.productId),
    ...input.leftovers.map((line) => line.productId),
  ]);
  const balances = [...productIds].map((productId) => {
    const purchased = input.purchases.filter((line) => line.productId === productId).reduce((sum, line) => sum + line.quantity, 0);
    const sold = input.sales.filter((line) => line.productId === productId).reduce((sum, line) => sum + line.quantity, 0);
    const gifted = input.leftovers.filter((line) => line.productId === productId).reduce((sum, line) => sum + line.giftedQuantity, 0);
    const consumed = input.leftovers.filter((line) => line.productId === productId).reduce((sum, line) => sum + line.consumedQuantity, 0);
    return { productId, purchased, sold, gifted, consumed, difference: purchased - sold - gifted - consumed };
  });

  return {
    purchasedQuantity, soldQuantity, giftedQuantity, consumedQuantity,
    purchaseCostCents, salesCents, commissionCents, expensesCents,
    creditCents, creditCollectionsCents, cashFromSalesCents, businessPaidPurchasesCents, businessPaidExpensesCents,
    economicProfitCents, marginBps: calculateMargin(economicProfitCents, salesCents),
    balances, unitDifference: purchasedQuantity - soldQuantity - giftedQuantity - consumedQuantity,
  };
}
