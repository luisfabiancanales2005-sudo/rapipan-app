import { z } from "zod";

const cents = z.number().int().nonnegative().safe();
const name = z.string().trim().min(1).max(100);
const uuid = z.string().uuid();
export const configurationSchema = z.object({
  name,
  usualCostCents: cents,
  usualPriceCents: cents,
  usualCourierCommissionCents: cents,
  owners: z.array(z.object({ id: uuid, name, shareBps: z.number().int().min(0).max(10000) })).min(1),
  products: z.array(z.object({ id: uuid.nullable(), name, active: z.boolean(), defaultCostCents: cents, defaultPriceCents: cents })),
  couriers: z.array(z.object({ id: uuid.nullable(), name, active: z.boolean(), defaultCommissionCents: cents })),
});
export type ConfigurationPayload = z.infer<typeof configurationSchema>;

export function validateConfiguration(payload: ConfigurationPayload): string[] {
  if (!configurationSchema.safeParse(payload).success) return ["Revisa los nombres, porcentajes e importes."];
  const errors: string[] = [];
  if (payload.owners.length !== 2 || new Set(payload.owners.map((owner) => owner.id)).size !== 2 || payload.owners.some((owner) => owner.shareBps !== 5000)) {
    errors.push("Los dos socios deben ser distintos y mantener la utilidad 50/50.");
  }
  if (!payload.products.some((product) => product.active)) errors.push("Debe quedar al menos un producto activo.");
  for (const [label, rows] of [["producto", payload.products], ["repartidor", payload.couriers]] as const) {
    const names = rows.map((row) => row.name.trim().toLocaleLowerCase("es-PE"));
    if (new Set(names).size !== names.length) errors.push(`No repitas el nombre de un ${label}.`);
  }
  return errors;
}

export function validatePreviewConfiguration(payload: ConfigurationPayload): string[] {
  if (!configurationSchema.safeParse(payload).success) return ["Revisa los nombres, porcentajes e importes."];
  const errors: string[] = [];
  if (new Set(payload.owners.map((owner) => owner.id)).size !== payload.owners.length
    || new Set(payload.owners.map((owner) => owner.name.trim().toLocaleLowerCase("es-PE"))).size !== payload.owners.length) {
    errors.push("Cada socio debe tener un nombre diferente.");
  }
  if (payload.owners.reduce((sum, owner) => sum + owner.shareBps, 0) !== 10000) errors.push("Los porcentajes deben sumar 100%.");
  if (!payload.products.some((product) => product.active)) errors.push("Debe quedar al menos un producto activo.");
  for (const [label, rows] of [["producto", payload.products], ["repartidor", payload.couriers]] as const) {
    const names = rows.map((row) => row.name.trim().toLocaleLowerCase("es-PE"));
    if (new Set(names).size !== names.length) errors.push(`No repitas el nombre de un ${label}.`);
  }
  return errors;
}
