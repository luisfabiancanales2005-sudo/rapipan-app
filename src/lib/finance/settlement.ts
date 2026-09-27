import { calculateClosure } from "./calculations";
import type { ClosureInput, OwnerSettlement } from "./types";

function requireSafeCents(value: number): number {
  if (!Number.isSafeInteger(value)) throw new Error("El cálculo supera el rango seguro de centavos.");
  return value;
}

/** Allocate an integer amount by integer weights, with stable largest remainders. */
export function allocateCents(totalCents: number, weights: { id: string; weight: number; sortOrder: number }[]) {
  if (!Number.isSafeInteger(totalCents) || weights.some((item) => !Number.isSafeInteger(item.weight) || item.weight < 0)) {
    throw new Error("El reparto requiere enteros no negativos.");
  }
  const sign = totalCents < 0 ? -1 : 1;
  const absolute = BigInt(Math.abs(totalCents));
  const weightTotal = weights.reduce((sum, item) => sum + BigInt(item.weight), 0n);
  if (weightTotal === 0n) {
    if (totalCents !== 0) throw new Error("No hay pesos para repartir el importe.");
    return Object.fromEntries(weights.map(({ id }) => [id, 0])) as Record<string, number>;
  }
  const portions = weights.map((item) => {
    const numerator = absolute * BigInt(item.weight);
    return { ...item, cents: numerator / weightTotal, remainder: numerator % weightTotal };
  });
  let remaining = absolute - portions.reduce((sum, item) => sum + item.cents, 0n);
  const byRemainder = [...portions].sort((a, b) => {
    if (a.remainder !== b.remainder) return a.remainder > b.remainder ? -1 : 1;
    return a.sortOrder - b.sortOrder;
  });
  for (const item of byRemainder) {
    if (remaining === 0n) break;
    item.cents += 1n;
    remaining -= 1n;
  }
  return Object.fromEntries(portions.map((item) => [
    item.id,
    item.cents === 0n ? 0 : requireSafeCents(Number(item.cents) * sign),
  ])) as Record<string, number>;
}

export function calculateSettlement(input: ClosureInput) {
  const totals = calculateClosure(input);
  const owners = [...input.owners].sort((a, b) => a.sortOrder - b.sortOrder);
  if (owners.length !== 2 || owners.reduce((sum, owner) => sum + owner.shareBps, 0) !== 10000) {
    throw new Error("Se requieren dos socios con participaciones que sumen 100%.");
  }

  const cashBeforeSettlementCents = requireSafeCents(
    input.openingBusinessCashCents + totals.cashFromSalesCents + totals.creditCollectionsCents
      - totals.businessPaidPurchasesCents - totals.commissionCents - totals.businessPaidExpensesCents,
  );
  const cashAvailableCents = cashBeforeSettlementCents - input.reservedBusinessCashCents;
  const capitalByOwner = owners.map((owner) => {
    const purchases = input.capitalContributions.filter((line) => line.ownerId === owner.id)
      .reduce((sum, line) => sum + line.amountCents, 0);
    const expenses = input.expenses.filter((line) => line.payer.type === "owner" && line.payer.ownerId === owner.id)
      .reduce((sum, line) => sum + line.amountCents, 0);
    return { ...owner, contributedCents: purchases + expenses, owedCents: owner.priorCapitalCents + purchases + expenses };
  });
  const totalCapitalOwedCents = capitalByOwner.reduce((sum, owner) => sum + owner.owedCents, 0);
  const capitalToReimburseCents = Math.min(Math.max(0, cashAvailableCents), totalCapitalOwedCents);
  const reimbursements = allocateCents(capitalToReimburseCents, capitalByOwner.map((owner) => ({
    id: owner.id, weight: owner.owedCents, sortOrder: owner.sortOrder,
  })));
  const cashProfitToDistributeCents = Math.max(0, cashAvailableCents - capitalToReimburseCents);
  const shares = owners.map((owner) => ({ id: owner.id, weight: owner.shareBps, sortOrder: owner.sortOrder }));
  const economicShares = allocateCents(totals.economicProfitCents, shares);
  const cashProfitShares = allocateCents(cashProfitToDistributeCents, shares);
  const settlements: OwnerSettlement[] = capitalByOwner.map((owner) => ({
    ownerId: owner.id,
    ownerName: owner.name,
    shareBps: owner.shareBps,
    economicProfitShareCents: economicShares[owner.id],
    priorCapitalCents: owner.priorCapitalCents,
    capitalContributedCents: owner.contributedCents,
    capitalReimbursedCents: reimbursements[owner.id],
    capitalPendingCents: owner.owedCents - reimbursements[owner.id],
    cashProfitDistributedCents: cashProfitShares[owner.id],
    totalCashDueCents: reimbursements[owner.id] + cashProfitShares[owner.id],
  }));

  return {
    ...totals,
    cashBeforeSettlementCents,
    cashAvailableCents,
    cashDeficitCents: Math.max(0, -cashAvailableCents),
    capitalToReimburseCents,
    cashProfitToDistributeCents,
    settlements,
  };
}
