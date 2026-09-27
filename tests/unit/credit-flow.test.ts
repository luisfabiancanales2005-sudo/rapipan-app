import { describe, expect, it } from "vitest";
import { collectionsForClose, groupCollectionsByDate } from "../../src/lib/finance/credit-flow";

describe("cobros de créditos", () => {
  const payments = [
    { paymentDate: "2026-09-12", amountCents: 900 },
    { paymentDate: "2026-09-14", amountCents: 500 },
    { paymentDate: "2026-09-14", amountCents: 300 },
    { paymentDate: "2026-09-17", amountCents: 700 },
  ];

  it("liquida un cobro de un día sin cierre en el siguiente cierre una sola vez", () => {
    expect(collectionsForClose(payments, "2026-09-11", "2026-09-15")).toBe(1700);
    expect(collectionsForClose(payments, "2026-09-15", "2026-09-18")).toBe(700);
    expect(collectionsForClose(payments, "2026-09-18", "2026-09-20")).toBe(0);
  });

  it("conserva la fecha efectiva del cobro para el libro de caja", () => {
    expect(groupCollectionsByDate(payments)).toEqual([
      ["2026-09-17", 700], ["2026-09-14", 800], ["2026-09-12", 900],
    ]);
  });
});
