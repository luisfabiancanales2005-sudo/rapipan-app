import { z } from "zod";
import { calculateSettlement } from "../finance/settlement";
import type { ClosureInput } from "../finance/types";
import { courierWorkedMinutes } from "../couriers/time";

const cents = z.number().int().nonnegative().safe();
const quantity = z.number().int().nonnegative().safe();
const shift = z.enum(["AM", "PM"]);
const payer = z.discriminatedUnion("type", [
  z.object({ type: z.literal("owner"), ownerId: z.string().uuid() }),
  z.object({ type: z.literal("business_cash"), ownerId: z.null() }),
]);

export const closureSchema = z.object({
  operatingDate: z.iso.date(),
  purchases: z.array(z.object({ productId: z.string().uuid(), quantity: quantity.positive(), unitCostCents: cents, shift })),
  capitalContributions: z.array(z.object({ ownerId: z.string().uuid(), amountCents: cents })).min(1),
  businessPaidPurchasesCents: cents.optional(),
  sales: z.array(z.object({ productId: z.string().uuid(), quantity: quantity.positive(), unitPriceCents: cents, shift })),
  leftovers: z.array(z.object({ productId: z.string().uuid(), giftedQuantity: quantity, consumedQuantity: quantity, shift })),
  courierRuns: z.array(z.object({
    productId: z.string().uuid(), courierId: z.string().uuid(), deliveredQuantity: quantity,
    commissionPerUnitCents: cents, additionalCommissionCents: cents, shift,
    startTime: z.string().optional(), endTime: z.string().optional(),
  })),
  expenses: z.array(z.object({ concept: z.string().trim().min(1).max(120), amountCents: cents.positive(), payer, shift })),
  credit: z.object({ amountCents: cents.positive(), reference: z.string().max(200) }).nullable(),
  creditCollectionsCents: cents.optional(),
  owners: z.array(z.object({
    id: z.string().uuid(), name: z.string().min(1), shareBps: quantity.max(10000),
    priorCapitalCents: cents, sortOrder: quantity,
  })).min(1),
  openingBusinessCashCents: cents,
  reservedBusinessCashCents: cents,
  notes: z.string().max(1000),
});

export function validateClosure(input: ClosureInput, preview = false): string[] {
  const parsed = closureSchema.safeParse(input);
  if (!parsed.success) return parsed.error.issues.map((issue) => issue.message);

  const errors: string[] = [];
  const ownerIds = new Set(input.owners.map((owner) => owner.id));
  const productIds = new Set(input.purchases.map((line) => line.productId));
  if (input.owners.reduce((sum, owner) => sum + owner.shareBps, 0) !== 10000
    || ownerIds.size !== input.owners.length || (!preview && (input.owners.length !== 2 || input.owners.some((owner) => owner.shareBps !== 5000)))) {
    errors.push(preview ? "Los porcentajes de los socios deben sumar 100%." : "Los dos socios deben repartir la utilidad 50/50.");
  }
  if (errors.length > 0) return errors;
  const result = calculateSettlement(input);
  if (input.purchases.length === 0) errors.push("Registra al menos una compra para cerrar el día.");
  if (input.capitalContributions.length !== input.owners.length
    || new Set(input.capitalContributions.map((line) => line.ownerId)).size !== input.owners.length
    || input.capitalContributions.some((line) => !ownerIds.has(line.ownerId))) errors.push("Registra el aporte de cada socio.");
  if (result.businessPaidPurchasesCents > input.purchases.filter((line) => line.shift === "PM").reduce((sum, line) => sum + line.quantity * line.unitCostCents, 0)) {
    errors.push(preview ? "El dinero de caja usado para productos no puede superar el costo de las compras de PM." : "El dinero de caja usado para panes no puede superar el costo de las compras de PM.");
  }
  if (input.capitalContributions.reduce((sum, line) => sum + line.amountCents, 0) + result.businessPaidPurchasesCents !== result.purchaseCostCents) {
    errors.push("Los aportes de los socios más el dinero usado de caja deben sumar el costo total de las compras.");
  }
  if (input.expenses.some((line) => line.payer.type === "owner" && !ownerIds.has(line.payer.ownerId))) {
    errors.push("El gasto debe indicar un socio válido.");
  }
  if (result.balances.some((item) => item.difference !== 0)) {
    errors.push(preview ? "Las unidades compradas deben igualar las vendidas, regaladas y consumidas por producto al final del día." : "Los panes comprados deben igualar vendidos, regalados y consumidos por producto al final del día.");
  }
  if (input.courierRuns.some((run) => !productIds.has(run.productId))) {
    errors.push("El repartidor debe corresponder a un producto comprado.");
  }
  if (input.courierRuns.some((run) => (run.startTime !== undefined || run.endTime !== undefined) && courierWorkedMinutes(run.startTime, run.endTime) === null)) {
    errors.push("La hora de inicio debe ser anterior a la de fin y el reparto debe durar como máximo 12 horas.");
  }
  if (input.courierRuns.some((run) => run.deliveredQuantity === 0 && run.additionalCommissionCents === 0
    && courierWorkedMinutes(run.startTime, run.endTime) === null)) {
    errors.push(preview ? "Cada reparto debe tener unidades entregadas, una comisión adicional u horas trabajadas." : "Cada reparto debe tener panes entregados o una comisión adicional.");
  }
  const hoursByCourierShift = new Map<string, string>();
  for (const run of input.courierRuns) {
    const key = `${run.shift}:${run.courierId}`;
    const value = `${run.startTime ?? ""}-${run.endTime ?? ""}`;
    const previous = hoursByCourierShift.get(key);
    if (previous !== undefined && previous !== value) errors.push("Un repartidor debe tener el mismo horario en todas sus líneas del mismo turno.");
    hoursByCourierShift.set(key, value);
  }
  for (const productId of productIds) for (const shiftValue of ["AM", "PM"] as const) {
    const delivered = input.courierRuns.filter((run) => run.productId === productId && run.shift === shiftValue).reduce((sum, run) => sum + run.deliveredQuantity, 0);
    const sold = input.sales.filter((line) => line.productId === productId && line.shift === shiftValue).reduce((sum, line) => sum + line.quantity, 0);
    if (delivered > sold) errors.push(preview ? `Las unidades entregadas por repartidor en ${shiftValue} no pueden superar las vendidas.` : `Los panes entregados por repartidor en ${shiftValue} no pueden superar los vendidos.`);
  }
  if (result.creditCents > result.salesCents) errors.push("El crédito no puede superar las ventas del día.");
  if (result.cashDeficitCents > 0) errors.push("No hay efectivo suficiente para cubrir los pagos hechos con caja.");
  if (input.reservedBusinessCashCents > result.cashBeforeSettlementCents) {
    errors.push("La caja reservada supera el efectivo disponible.");
  }
  return [...new Set(errors)];
}
