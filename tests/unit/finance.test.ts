import { describe, expect, it } from "vitest";
import { calculateClosure, calculateMargin, calculateProfit, calculateShiftMetrics } from "../../src/lib/finance/calculations";
import { allocateCents, calculateSettlement } from "../../src/lib/finance/settlement";
import type { ClosureInput } from "../../src/lib/finance/types";
import { formatMoney, parseMoney } from "../../src/lib/format/money";
import { validateClosure } from "../../src/lib/validation/daily-close";

const PRODUCT = "00000000-0000-4000-8000-000000000021";
const COURIER = "00000000-0000-4000-8000-000000000031";
const COURIER_PM = "00000000-0000-4000-8000-000000000032";
const FABIANA = "00000000-0000-4000-8000-000000000011";
const FABIAN = "00000000-0000-4000-8000-000000000012";

function example(): ClosureInput {
  return {
    operatingDate: "2026-09-17",
    purchases: [{ productId: PRODUCT, quantity: 30, unitCostCents: 250, shift: "AM" }],
    capitalContributions: [{ ownerId: FABIANA, amountCents: 3750 }, { ownerId: FABIAN, amountCents: 3750 }],
    sales: [{ productId: PRODUCT, quantity: 27, unitPriceCents: 450, shift: "AM" }],
    leftovers: [{ productId: PRODUCT, giftedQuantity: 2, consumedQuantity: 1, shift: "AM" }],
    courierRuns: [{ productId: PRODUCT, courierId: COURIER, deliveredQuantity: 27, commissionPerUnitCents: 100, additionalCommissionCents: 0, shift: "AM" }],
    expenses: [],
    credit: null,
    owners: [
      { id: FABIANA, name: "Fabiana", shareBps: 5000, priorCapitalCents: 0, sortOrder: 1 },
      { id: FABIAN, name: "Fabián", shareBps: 5000, priorCapitalCents: 0, sortOrder: 2 },
    ],
    openingBusinessCashCents: 0,
    reservedBusinessCashCents: 0,
    notes: "",
  };
}

describe("dinero y utilidad", () => {
  it("convierte soles a centavos sin redondeos de coma flotante", () => {
    expect(parseMoney("S/ 4.50")).toBe(450);
    expect(parseMoney("4,5")).toBe(450);
    expect(parseMoney("4.567")).toBeNull();
    expect(formatMoney(12150)).toBe("S/ 121.50");
  });

  it("calcula utilidad y margen sin dividir entre cero", () => {
    expect(calculateProfit(12150, 7500, 2700, 0)).toBe(1950);
    expect(calculateMargin(1950, 12150)).toBe(1604);
    expect(calculateMargin(0, 0)).toBeNull();
  });

  it("cuadra unidades por producto", () => {
    const totals = calculateClosure(example());
    expect(totals.unitDifference).toBe(0);
    expect(totals.balances[0].difference).toBe(0);
    expect(validateClosure(example())).toEqual([]);
  });

  it("separa AM y PM sin duplicar el día ni ocultar un turno sin ventas", () => {
    const input = example();
    input.purchases = [
      { productId: PRODUCT, quantity: 10, unitCostCents: 250, shift: "AM" },
      { productId: PRODUCT, quantity: 20, unitCostCents: 250, shift: "PM" },
    ];
    input.sales = [{ productId: PRODUCT, quantity: 20, unitPriceCents: 450, shift: "PM" }];
    input.leftovers = [{ productId: PRODUCT, giftedQuantity: 10, consumedQuantity: 0, shift: "AM" }];
    input.courierRuns = [];
    expect(validateClosure(input)).toEqual([]);
    expect(calculateShiftMetrics(input).map((shift) => [shift.shift, shift.salesCents, shift.profitCents]))
      .toEqual([["AM", 0, -2500], ["PM", 9000, 4000]]);
    expect(calculateSettlement(input).economicProfitCents).toBe(1500);
  });

  it("registra repartidores distintos en AM y PM y suma ambas comisiones una sola vez", () => {
    const input = example();
    input.sales = [
      { productId: PRODUCT, quantity: 12, unitPriceCents: 450, shift: "AM" },
      { productId: PRODUCT, quantity: 15, unitPriceCents: 450, shift: "PM" },
    ];
    input.courierRuns = [
      { productId: PRODUCT, courierId: COURIER, deliveredQuantity: 12, commissionPerUnitCents: 100, additionalCommissionCents: 0, shift: "AM" },
      { productId: PRODUCT, courierId: COURIER_PM, deliveredQuantity: 15, commissionPerUnitCents: 80, additionalCommissionCents: 50, shift: "PM" },
    ];
    expect(validateClosure(input)).toEqual([]);
    expect(calculateShiftMetrics(input).map((shift) => shift.commissionCents)).toEqual([1200, 1250]);
    expect(calculateSettlement(input).commissionCents).toBe(2450);
    expect(calculateSettlement(input).economicProfitCents).toBe(2200);
    input.courierRuns[1].deliveredQuantity = 16;
    expect(validateClosure(input)).toContain("Los panes entregados por repartidor en PM no pueden superar los vendidos.");
  });

  it("rechaza una fila de reparto sin panes ni comisión", () => {
    const input = example();
    input.courierRuns[0].deliveredQuantity = 0;
    expect(validateClosure(input)).toContain("Cada reparto debe tener panes entregados o una comisión adicional.");
  });

  it("permite vender en PM panes comprados en AM y cuadra al cierre diario", () => {
    const input = example();
    input.purchases = [{ productId: PRODUCT, quantity: 30, unitCostCents: 250, shift: "AM" }];
    input.sales = [{ productId: PRODUCT, quantity: 30, unitPriceCents: 450, shift: "PM" }];
    input.leftovers = [];
    input.courierRuns = [];
    expect(validateClosure(input)).toEqual([]);
    expect(calculateShiftMetrics(input).map((item) => item.salesCents)).toEqual([0, 13500]);
    expect(calculateSettlement(input).economicProfitCents).toBe(6000);
  });

  it("reconoce el adelanto desigual sin alterar la utilidad 50/50", () => {
    const input = example();
    input.capitalContributions = [{ ownerId: FABIANA, amountCents: 2500 }, { ownerId: FABIAN, amountCents: 5000 }];
    const settlement = calculateSettlement(input);
    expect(validateClosure(input)).toEqual([]);
    expect(settlement.settlements.map((line) => line.capitalContributedCents)).toEqual([2500, 5000]);
    expect(settlement.settlements.map((line) => line.economicProfitShareCents)).toEqual([975, 975]);
    expect(settlement.settlements.map((line) => line.totalCashDueCents)).toEqual([3475, 5975]);
  });
});

describe("liquidación", () => {
  it("reembolsa capital antes de repartir la utilidad en efectivo", () => {
    const result = calculateSettlement(example());
    expect(result.economicProfitCents).toBe(1950);
    expect(result.cashBeforeSettlementCents).toBe(9450);
    expect(result.capitalToReimburseCents).toBe(7500);
    expect(result.cashProfitToDistributeCents).toBe(1950);
    expect(result.settlements.map((line) => line.economicProfitShareCents)).toEqual([975, 975]);
    expect(result.settlements.map((line) => line.totalCashDueCents)).toEqual([4725, 4725]);
  });

  it("mantiene el crédito como venta sin repartirlo como efectivo", () => {
    const input = example();
    input.credit = { amountCents: 900, reference: "Fiado" };
    const result = calculateSettlement(input);
    expect(result.salesCents).toBe(12150);
    expect(result.economicProfitCents).toBe(1950);
    expect(result.cashFromSalesCents).toBe(11250);
    expect(result.cashProfitToDistributeCents).toBe(1050);
    expect(result.settlements.map((line) => line.cashProfitDistributedCents)).toEqual([525, 525]);
  });

  it("ingresa un cobro anterior a caja sin duplicar ventas ni utilidad", () => {
    const input = example();
    input.creditCollectionsCents = 900;
    const result = calculateSettlement(input);
    expect(result.salesCents).toBe(12150);
    expect(result.economicProfitCents).toBe(1950);
    expect(result.creditCollectionsCents).toBe(900);
    expect(result.cashBeforeSettlementCents).toBe(10350);
    expect(result.cashProfitToDistributeCents).toBe(2850);
  });

  it("arrastra capital no reembolsado y no distribuye utilidad mientras se adeuda", () => {
    const input = example();
    input.sales = [{ productId: PRODUCT, quantity: 10, unitPriceCents: 450, shift: "AM" }];
    input.leftovers = [{ productId: PRODUCT, giftedQuantity: 20, consumedQuantity: 0, shift: "AM" }];
    input.courierRuns = [];
    const result = calculateSettlement(input);
    expect(result.economicProfitCents).toBe(-3000);
    expect(result.capitalToReimburseCents).toBe(4500);
    expect(result.cashProfitToDistributeCents).toBe(0);
    expect(result.settlements.map((line) => line.capitalPendingCents)).toEqual([1500, 1500]);
  });

  it("reparte centavos residuales de forma determinística", () => {
    expect(allocateCents(1, [
      { id: FABIANA, weight: 5000, sortOrder: 1 },
      { id: FABIAN, weight: 5000, sortOrder: 2 },
    ])).toEqual({ [FABIANA]: 1, [FABIAN]: 0 });
    expect(allocateCents(-1, [
      { id: FABIANA, weight: 5000, sortOrder: 1 },
      { id: FABIAN, weight: 5000, sortOrder: 2 },
    ])).toEqual({ [FABIANA]: -1, [FABIAN]: 0 });
  });

  it("rechaza cierre con panes faltantes o crédito mayor que ventas", () => {
    const input = example();
    input.leftovers[0].giftedQuantity = 1;
    input.credit = { amountCents: 20000, reference: "" };
    const errors = validateClosure(input);
    expect(errors).toContain("Los panes comprados deben igualar vendidos, regalados y consumidos por producto al final del día.");
    expect(errors).toContain("El crédito no puede superar las ventas del día.");
  });

  it("descuenta comisión adicional y gastos sin perder el origen del capital", () => {
    const input = example();
    input.courierRuns[0].additionalCommissionCents = 150;
    input.expenses = [
      { concept: "Bolsas", amountCents: 200, payer: { type: "owner", ownerId: FABIAN }, shift: "AM" },
      { concept: "Taxi", amountCents: 100, payer: { type: "business_cash", ownerId: null }, shift: "AM" },
    ];
    const result = calculateSettlement(input);
    expect(result.economicProfitCents).toBe(1500);
    expect(result.settlements[1].capitalContributedCents).toBe(3950);
    expect(result.cashBeforeSettlementCents).toBe(9200);
    expect(result.settlements.reduce((sum, line) => sum + line.totalCashDueCents, 0)).toBe(9200);
  });

  it("admite un día explícito sin ventas si todos los panes se justifican", () => {
    const input = example();
    input.sales = [];
    input.courierRuns = [];
    input.leftovers = [{ productId: PRODUCT, giftedQuantity: 30, consumedQuantity: 0, shift: "AM" }];
    const result = calculateSettlement(input);
    expect(result.marginBps).toBeNull();
    expect(result.economicProfitCents).toBe(-7500);
    expect(result.settlements.map((line) => line.capitalPendingCents)).toEqual([3750, 3750]);
    expect(validateClosure(input)).toEqual([]);
  });

  it("rechaza caja insuficiente y reparto mayor que ventas", () => {
    const input = example();
    input.expenses = [{ concept: "Gasto de caja", amountCents: 10000, payer: { type: "business_cash", ownerId: null }, shift: "AM" }];
    input.credit = { amountCents: 12000, reference: "Cliente" };
    input.courierRuns[0].deliveredQuantity = 28;
    const errors = validateClosure(input);
    expect(errors).toContain("No hay efectivo suficiente para cubrir los pagos hechos con caja.");
    expect(errors).toContain("Los panes entregados por repartidor en AM no pueden superar los vendidos.");
  });

  it("arrastra capital previo y lo reembolsa antes de repartir efectivo", () => {
    const input = example();
    input.owners[1].priorCapitalCents = 1000;
    const result = calculateSettlement(input);
    expect(result.settlements[1].capitalReimbursedCents).toBe(4750);
    expect(result.settlements[1].capitalPendingCents).toBe(0);
    expect(result.cashProfitToDistributeCents).toBe(950);
  });
});
