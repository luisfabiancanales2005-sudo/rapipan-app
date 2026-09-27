const numberFormatter = new Intl.NumberFormat("es-PE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMoney(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new Error("El importe debe estar en centavos enteros.");
  return `S/ ${numberFormatter.format(cents / 100)}`;
}

/** Converts a decimal amount in soles to integer cents. Never uses float math. */
export function parseMoney(value: string): number | null {
  const normalized = value.trim().replace(/^S\/\s*/, "").replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, decimal = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}
