import { describe, expect, it } from "vitest";
import { validateConfiguration, validatePreviewConfiguration, type ConfigurationPayload } from "../../src/lib/validation/configuration";

const payload: ConfigurationPayload = {
  name: "Rapipan", usualCostCents: 250, usualPriceCents: 450, usualCourierCommissionCents: 100,
  owners: [
    { id: "00000000-0000-4000-8000-000000000011", name: "Fabiana", shareBps: 5000 },
    { id: "00000000-0000-4000-8000-000000000012", name: "Fabián", shareBps: 5000 },
  ],
  products: [{ id: "00000000-0000-4000-8000-000000000021", name: "Pan Rapipan", active: true, defaultCostCents: 250, defaultPriceCents: 450 }],
  couriers: [],
};

describe("configuration", () => {
  it("accepts one or two active products, then a deactivated test product", () => {
    expect(validateConfiguration(payload)).toEqual([]);
    const second = { id: null, name: "Producto de prueba", active: true, defaultCostCents: 300, defaultPriceCents: 500 };
    expect(validateConfiguration({ ...payload, products: [...payload.products, second] })).toEqual([]);
    expect(validateConfiguration({ ...payload, products: [...payload.products, { ...second, active: false }] })).toEqual([]);
  });
  it("rejects invalid shares and deactivating every product", () => {
    expect(validateConfiguration({ ...payload, owners: [{ ...payload.owners[0], shareBps: 6000 }, payload.owners[1]] })).not.toEqual([]);
    expect(validateConfiguration({ ...payload, owners: [{ ...payload.owners[0], shareBps: 6000 }, { ...payload.owners[1], shareBps: 4000 }] }))
      .toContain("Los dos socios deben ser distintos y mantener la utilidad 50/50.");
    expect(validateConfiguration({ ...payload, products: [{ ...payload.products[0], active: false }] })).not.toEqual([]);
  });
  it("allows one or more demo partners with custom shares totaling 100%", () => {
    const solo = { ...payload, owners: [{ ...payload.owners[0], name: "Socio 1", shareBps: 10000 }] };
    expect(validatePreviewConfiguration(solo)).toEqual([]);
    expect(validateConfiguration(solo)).not.toEqual([]);
    const three = { ...payload, owners: [
      { ...payload.owners[0], name: "Socio 1", shareBps: 5000 },
      { ...payload.owners[1], name: "Socio 2", shareBps: 3000 },
      { id: "00000000-0000-4000-8000-000000000013", name: "Socio 3", shareBps: 2000 },
    ] };
    expect(validatePreviewConfiguration(three)).toEqual([]);
    expect(validatePreviewConfiguration({ ...three, owners: three.owners.map((owner) => ({ ...owner, shareBps: 3000 })) }))
      .toContain("Los porcentajes deben sumar 100%.");
  });
});
