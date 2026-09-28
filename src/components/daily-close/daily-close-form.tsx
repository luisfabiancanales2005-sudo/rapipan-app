"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { calculateShiftMetrics } from "@/lib/finance/calculations";
import { allocateCents, calculateSettlement } from "@/lib/finance/settlement";
import type { ClosureInput, CourierRunInput, OwnerShareInput, Payer, Shift } from "@/lib/finance/types";
import { formatMoney, parseMoney } from "@/lib/format/money";
import { createDailyClosure, updateDailyClosure } from "@/lib/supabase/mutations/closures";
import { getUnallocatedCollections } from "@/lib/supabase/queries/history";
import { todayInLima } from "@/lib/dates/lima";
import { validateClosure } from "@/lib/validation/daily-close";

type Product = { id: string; name: string; default_cost_cents: number; default_price_cents: number };
type Courier = { id: string; name: string; default_commission_cents: number };
export type DailyCloseCatalog = {
  businessId?: string;
  products: Product[];
  couriers: Courier[];
  owners: OwnerShareInput[];
  defaults: { usual_cost_cents: number; usual_price_cents: number; usual_courier_commission_cents: number };
};

type PurchaseRow = { productId: string; quantity: string; unitCost: string; shift: Shift };
type SaleRow = { productId: string; quantity: string; unitPrice: string; shift: Shift };
type LeftoverRow = { gifted: string; consumed: string };
type ExpenseRow = { concept: string; amount: string; payer: string; shift: Shift };
type CourierRow = { key: string; courierId: string; productId: string; delivered: string; commission: string; extraCommission: string; shift: Shift };

function courierRow(run: CourierRunInput, key: string): CourierRow {
  return { key, courierId: run.courierId, productId: run.productId, delivered: String(run.deliveredQuantity), commission: soles(run.commissionPerUnitCents), extraCommission: soles(run.additionalCommissionCents), shift: run.shift };
}

function soles(cents: number) { return (cents / 100).toFixed(2); }
function whole(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}
function payer(value: string): Payer {
  return value === "cash" ? { type: "business_cash", ownerId: null } : { type: "owner", ownerId: value };
}
const inputClass = "min-h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3 text-sm font-semibold text-[var(--text)] outline-none focus:border-[var(--green)] focus:ring-2 focus:ring-[var(--green-soft)]";
const labelClass = "grid gap-1.5 text-xs font-bold text-[var(--muted)]";

type EditContext = { id: string; expectedUpdatedAt: string; preserveCredits: boolean; creditLocked?: boolean };

export function DailyCloseForm({ catalog, preview = false, businessId, initialInput, edit }: {
  catalog: DailyCloseCatalog;
  preview?: boolean;
  businessId?: string;
  initialInput?: ClosureInput;
  edit?: EditContext;
}) {
  const firstProduct = catalog.products[0];
  const [date, setDate] = useState(() => initialInput?.operatingDate ?? todayInLima());
  const [purchases, setPurchases] = useState<PurchaseRow[]>(() => initialInput?.purchases.map((item) => ({ productId: item.productId, quantity: String(item.quantity), unitCost: soles(item.unitCostCents), shift: item.shift })) ?? [{ productId: firstProduct.id, quantity: "", unitCost: soles(firstProduct.default_cost_cents), shift: "AM" }]);
  const [sales, setSales] = useState<SaleRow[]>(() => initialInput?.sales.map((item) => ({ productId: item.productId, quantity: String(item.quantity), unitPrice: soles(item.unitPriceCents), shift: item.shift })) ?? [{ productId: firstProduct.id, quantity: "", unitPrice: soles(firstProduct.default_price_cents), shift: "AM" }]);
  const [leftovers, setLeftovers] = useState<Record<string, LeftoverRow>>(() => Object.fromEntries((initialInput?.leftovers ?? []).map((item) => [`${item.shift}:${item.productId}`, { gifted: String(item.giftedQuantity), consumed: String(item.consumedQuantity) }])));
  const [courierRuns, setCourierRuns] = useState<CourierRow[]>(() => initialInput?.courierRuns.map((run, index) => courierRow(run, `saved-${index}`)) ?? []);
  const [creditEnabled, setCreditEnabled] = useState(Boolean(initialInput?.credit));
  const [creditAmount, setCreditAmount] = useState(initialInput?.credit ? soles(initialInput.credit.amountCents) : "");
  const [creditReference, setCreditReference] = useState(initialInput?.credit?.reference ?? "");
  const [expenses, setExpenses] = useState<ExpenseRow[]>(() => initialInput?.expenses.map((item) => ({ concept: item.concept, amount: soles(item.amountCents), payer: item.payer.type === "owner" ? item.payer.ownerId : "cash", shift: item.shift })) ?? []);
  const [useBusinessCashForPm, setUseBusinessCashForPm] = useState((initialInput?.businessPaidPurchasesCents ?? 0) > 0);
  const [businessCashForPm, setBusinessCashForPm] = useState(soles(initialInput?.businessPaidPurchasesCents ?? 0));
  const [customContributions, setCustomContributions] = useState(Boolean(initialInput && initialInput.capitalContributions.some((item) => item.amountCents !== allocateCents(initialInput.purchases.reduce((sum, line) => sum + line.quantity * line.unitCostCents, 0) - (initialInput.businessPaidPurchasesCents ?? 0), catalog.owners.map((owner) => ({ id: owner.id, weight: 1, sortOrder: owner.sortOrder })))[item.ownerId])));
  const [contributionAmounts, setContributionAmounts] = useState<Record<string, string>>(() => Object.fromEntries((initialInput?.capitalContributions ?? []).map((item) => [item.ownerId, soles(item.amountCents)])));
  const [openingCash, setOpeningCash] = useState(soles(initialInput?.openingBusinessCashCents ?? 0));
  const [reservedCash, setReservedCash] = useState(soles(initialInput?.reservedBusinessCashCents ?? 0));
  const [notes, setNotes] = useState(initialInput?.notes ?? "");
  const [collectionsCents, setCollectionsCents] = useState(initialInput?.creditCollectionsCents ?? 0);
  const [collectionsLoading, setCollectionsLoading] = useState(Boolean(businessId));
  const [collectionsError, setCollectionsError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedId, setSavedId] = useState("");

  useEffect(() => {
    if (!businessId || preview) return;
    let active = true;
    getUnallocatedCollections(businessId, date)
      .then((amount) => { if (active) { setCollectionsCents(amount); setCollectionsError(""); } })
      .catch((cause) => { if (active) setCollectionsError(cause instanceof Error ? cause.message : "No se pudieron cargar los cobros previos."); })
      .finally(() => { if (active) setCollectionsLoading(false); });
    return () => { active = false; };
  }, [businessId, date, preview]);

  const input = useMemo((): ClosureInput | null => {
    const purchaseLines = purchases.filter((row) => row.quantity.trim() !== "");
    const saleLines = sales.filter((row) => row.quantity.trim() !== "");
    if (purchaseLines.some((row) => whole(row.quantity) === null || parseMoney(row.unitCost) === null)
      || saleLines.some((row) => whole(row.quantity) === null || parseMoney(row.unitPrice) === null)) return null;
    if (expenses.some((row) => !row.concept.trim() || parseMoney(row.amount) === null)) return null;
    if (Object.values(leftovers).some((row) => whole(row.gifted || "0") === null || whole(row.consumed || "0") === null)) return null;
    if (parseMoney(openingCash) === null || parseMoney(reservedCash) === null) return null;
    if (courierRuns.some((row) => !row.courierId || whole(row.delivered) === null || parseMoney(row.commission) === null || parseMoney(row.extraCommission) === null)) return null;
    if (creditEnabled && parseMoney(creditAmount) === null) return null;
    if (useBusinessCashForPm && parseMoney(businessCashForPm) === null) return null;
    const purchaseCostCents = purchaseLines.reduce((sum, row) => sum + whole(row.quantity)! * parseMoney(row.unitCost)!, 0);
    const businessPaidPurchasesCents = useBusinessCashForPm ? parseMoney(businessCashForPm)! : 0;
    const defaultContributions = allocateCents(Math.max(0, purchaseCostCents - businessPaidPurchasesCents), catalog.owners.map((owner) => ({ id: owner.id, weight: 1, sortOrder: owner.sortOrder })));
    if (customContributions && catalog.owners.some((owner) => parseMoney(contributionAmounts[owner.id] ?? "") === null)) return null;
    return {
      operatingDate: date,
      purchases: purchaseLines.map((row) => ({ productId: row.productId, quantity: whole(row.quantity)!, unitCostCents: parseMoney(row.unitCost)!, shift: row.shift })),
      capitalContributions: catalog.owners.map((owner) => ({ ownerId: owner.id, amountCents: customContributions ? parseMoney(contributionAmounts[owner.id] ?? "")! : defaultContributions[owner.id] })),
      businessPaidPurchasesCents,
      sales: saleLines.map((row) => ({ productId: row.productId, quantity: whole(row.quantity)!, unitPriceCents: parseMoney(row.unitPrice)!, shift: row.shift })),
      leftovers: catalog.products.flatMap((product) => (["AM", "PM"] as const).map((shift) => ({ productId: product.id, shift, giftedQuantity: whole(leftovers[`${shift}:${product.id}`]?.gifted || "0")!, consumedQuantity: whole(leftovers[`${shift}:${product.id}`]?.consumed || "0")! }))),
      courierRuns: courierRuns.map((row) => ({ productId: row.productId, courierId: row.courierId, deliveredQuantity: whole(row.delivered)!, commissionPerUnitCents: parseMoney(row.commission)!, additionalCommissionCents: parseMoney(row.extraCommission)!, shift: row.shift })),
      expenses: expenses.map((row) => ({ concept: row.concept.trim(), amountCents: parseMoney(row.amount)!, payer: payer(row.payer), shift: row.shift })),
      credit: creditEnabled ? { amountCents: parseMoney(creditAmount)!, reference: creditReference.trim() } : null,
      creditCollectionsCents: collectionsCents,
      owners: catalog.owners,
      openingBusinessCashCents: parseMoney(openingCash)!, reservedBusinessCashCents: parseMoney(reservedCash)!, notes: notes.trim(),
    };
  }, [purchases, sales, leftovers, expenses, openingCash, reservedCash, courierRuns, creditEnabled, creditAmount, creditReference, catalog, date, notes, collectionsCents, customContributions, contributionAmounts, useBusinessCashForPm, businessCashForPm]);

  const summary = input ? calculateSettlement(input) : null;
  const shiftMetrics = input ? calculateShiftMetrics(input) : [];
  const errors = input ? validateClosure(input) : ["Revisa los importes y cantidades: usa números válidos y hasta dos decimales."];
  const ready = errors.length === 0 && !collectionsLoading && !collectionsError;
  const productName = (id: string) => catalog.products.find((item) => item.id === id)?.name ?? "Producto";
  const selectProduct = (value: string, onChange: (value: string) => void) => catalog.products.length > 1 ? <select className={inputClass} value={value} onChange={(event) => onChange(event.target.value)} aria-label="Producto">{catalog.products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select> : null;
  const productById = (id: string) => catalog.products.find((product) => product.id === id) ?? firstProduct;
  const selectShift = (value: Shift, onChange: (value: Shift) => void) => <label className={labelClass}>Turno<select className={inputClass} value={value} onChange={(event) => onChange(event.target.value as Shift)}><option value="AM">AM · mañana</option><option value="PM">PM · tarde</option></select></label>;
  const selectPayer = (value: string, onChange: (value: string) => void) => <select className={inputClass} value={value} onChange={(event) => onChange(event.target.value)} aria-label="Pagado por">{catalog.owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}<option value="cash">Caja del negocio</option></select>;

  function addCourierRun() {
    const shift: Shift = courierRuns.some((row) => row.shift === "AM") ? "PM" : "AM";
    const courier = catalog.couriers.find((item) => !courierRuns.some((row) => row.courierId === item.id)) ?? catalog.couriers[0];
    if (!courier) return;
    setCourierRuns((rows) => [...rows, { key: crypto.randomUUID(), shift, courierId: courier.id, productId: firstProduct.id, delivered: "", commission: soles(courier.default_commission_cents), extraCommission: "0.00" }]);
  }

  function updateCourierRun(key: string, change: Partial<CourierRow>) {
    setCourierRuns((rows) => rows.map((row) => row.key === key ? { ...row, ...change } : row));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!input || !ready || preview || submitting) return;
    setSubmitting(true);
    setSaveError("");
    try { setSavedId(edit ? await updateDailyClosure(edit.id, edit.expectedUpdatedAt, input, edit.preserveCredits) : await createDailyClosure(input)); }
    catch (cause) { setSaveError(cause instanceof Error ? cause.message : "No se pudo guardar el cierre."); }
    finally { setSubmitting(false); }
  }

  if (savedId) return <div className="card mx-auto max-w-xl p-8 text-center" role="status"><CheckCircle2 className="mx-auto text-[var(--green)]" size={40} /><h1 className="mt-4 text-2xl font-black">{edit ? "Cambios guardados" : "Día registrado"}</h1><p className="mt-2 text-sm text-[var(--muted)]">El cierre del {date} {edit ? "se actualizó y recalculó" : "se guardó y liquidó"} correctamente.</p><p className="mt-4 break-all text-xs text-[var(--muted)]">ID: {savedId}</p><button className="mt-6 rounded-xl bg-[var(--green)] px-5 py-3 text-sm font-bold text-white" onClick={() => { window.location.reload(); }}>{edit ? "Volver al detalle" : "Registrar otro día"}</button></div>;

  return <form onSubmit={submit} noValidate>
    <header className="mb-6"><span className="inline-block rounded-full bg-[var(--green-soft)] px-3 py-1 text-[0.7rem] font-extrabold uppercase tracking-wide text-[var(--green-dark)]">{preview ? "Demostración · no guarda datos" : edit ? "Editando cierre" : "Cierre diario"}</span><h1 className="mt-3 text-3xl font-black tracking-tight">{edit ? "Editar día" : "Registrar día"}</h1><p className="mt-1 text-sm text-[var(--muted)]">Registra AM y PM por separado al final del día. Ambos suman un único cierre y un día operado. Los panes comprados en AM y vendidos en PM se anotan una sola vez como compra, en AM; el balance se comprueba para el día completo.</p></header>
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-5">
        <section className="card p-5 sm:p-6">
          <h2 className="mb-4 text-lg font-extrabold">1. Fecha y compras por turno</h2>
          <label className={`${labelClass} max-w-xs`}>Fecha operativa<input className={inputClass} type="date" value={date} onChange={(event) => { setDate(event.target.value); setCollectionsLoading(Boolean(businessId)); setCollectionsError(""); }} disabled={Boolean(edit)} required /></label>
          <div className="mt-4 space-y-3">{purchases.map((row, index) => <div key={index} className="grid gap-2 rounded-xl bg-[var(--surface-muted)] p-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto]">
            {selectShift(row.shift, (shift) => setPurchases(purchases.map((item, at) => at === index ? { ...item, shift } : item)))}
            {selectProduct(row.productId, (productId) => setPurchases(purchases.map((item, at) => at === index ? { ...item, productId, unitCost: soles(productById(productId).default_cost_cents) } : item)))}
            <label className={labelClass}>Comprados<input className={inputClass} inputMode="numeric" value={row.quantity} onChange={(event) => setPurchases(purchases.map((item, at) => at === index ? { ...item, quantity: event.target.value } : item))} placeholder="30" /></label>
            <label className={labelClass}>Costo unitario S/<input className={inputClass} inputMode="decimal" value={row.unitCost} onChange={(event) => setPurchases(purchases.map((item, at) => at === index ? { ...item, unitCost: event.target.value } : item))} /></label>
            <button type="button" className="grid min-h-11 place-items-center rounded-xl text-red-600 disabled:opacity-40" aria-label="Quitar compra" disabled={purchases.length === 1} onClick={() => setPurchases(purchases.filter((_, at) => at !== index))}><Trash2 size={18} /></button>
          </div>)}</div>
          <button type="button" className="mt-3 flex min-h-11 items-center gap-2 text-sm font-bold text-[var(--green-dark)]" onClick={() => setPurchases([...purchases, { productId: firstProduct.id, quantity: "", unitCost: soles(firstProduct.default_cost_cents), shift: "PM" }])}><Plus size={18} /> Otra compra</button>
        </section>
        <section className="card p-5 sm:p-6" aria-label="Aportes de capital">
          <h2 className="text-lg font-extrabold">Capital para la compra</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">El costo se reparte 50/50 en dinero; los panes no se dividen entre socios. Indica si usaron efectivo de las ventas de AM para comprar panes de PM.</p>
          <label className="mt-4 flex min-h-11 items-center gap-3 text-sm font-semibold"><input type="checkbox" className="size-5 accent-[var(--green)]" checked={useBusinessCashForPm} onChange={(event) => setUseBusinessCashForPm(event.target.checked)} /> Usamos dinero de la caja de AM para comprar panes de PM</label>
          {useBusinessCashForPm && <label className={`${labelClass} mt-2 max-w-xs`}>Monto usado de caja para panes de PM · S/<input className={inputClass} inputMode="decimal" value={businessCashForPm} onChange={(event) => setBusinessCashForPm(event.target.value)} /></label>}
          <p className="mt-3 text-sm font-bold">Costo total: {formatMoney(summary?.purchaseCostCents ?? 0)} · De caja: {formatMoney(summary?.businessPaidPurchasesCents ?? 0)} · Aportado por socios: {formatMoney(Math.max(0, (summary?.purchaseCostCents ?? 0) - (summary?.businessPaidPurchasesCents ?? 0)))}</p>
          <label className="mt-4 flex min-h-11 items-center gap-3 text-sm font-semibold"><input type="checkbox" className="size-5 accent-[var(--green)]" checked={customContributions} onChange={(event) => { if (event.target.checked && input) setContributionAmounts(Object.fromEntries(input.capitalContributions.map((line) => [line.ownerId, soles(line.amountCents)]))); setCustomContributions(event.target.checked); }} /> Los aportes reales fueron distintos de 50/50</label>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">{catalog.owners.map((owner) => <label key={owner.id} className={labelClass}>Aportó {owner.name} · S/<input className={inputClass} inputMode="decimal" value={customContributions ? contributionAmounts[owner.id] ?? "" : soles(input?.capitalContributions.find((line) => line.ownerId === owner.id)?.amountCents ?? 0)} onChange={(event) => setContributionAmounts({ ...contributionAmounts, [owner.id]: event.target.value })} disabled={!customContributions} /></label>)}</div>
          <p className="mt-2 text-xs text-[var(--muted)]">Solo se devuelve lo realmente aportado por ustedes. El dinero de AM usado en PM no es un nuevo aporte ni otra venta. La utilidad del día permanece 50/50. Si pagaron AM y PM por adelantado después de liquidar el día anterior, deja la opción de caja desactivada.</p>
        </section>
        <section className="card p-5 sm:p-6">
          <h2 className="mb-4 text-lg font-extrabold">2. Ventas por turno</h2>
          <div className="space-y-3">{sales.map((row, index) => <div key={index} className="grid gap-2 rounded-xl bg-[var(--surface-muted)] p-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto]">
            {selectShift(row.shift, (shift) => setSales(sales.map((item, at) => at === index ? { ...item, shift } : item)))}
            {selectProduct(row.productId, (productId) => setSales(sales.map((item, at) => at === index ? { ...item, productId, unitPrice: soles(productById(productId).default_price_cents) } : item)))}
            <label className={labelClass}>Vendidos<input className={inputClass} inputMode="numeric" value={row.quantity} onChange={(event) => setSales(sales.map((item, at) => at === index ? { ...item, quantity: event.target.value } : item))} placeholder="27" /></label>
            <label className={labelClass}>Precio unitario S/<input className={inputClass} inputMode="decimal" value={row.unitPrice} onChange={(event) => setSales(sales.map((item, at) => at === index ? { ...item, unitPrice: event.target.value } : item))} /></label>
            <button type="button" className="grid min-h-11 place-items-center rounded-xl text-red-600 disabled:opacity-40" aria-label="Quitar venta" disabled={sales.length === 1} onClick={() => setSales(sales.filter((_, at) => at !== index))}><Trash2 size={18} /></button>
          </div>)}</div>
          <button type="button" className="mt-3 flex min-h-11 items-center gap-2 text-sm font-bold text-[var(--green-dark)]" onClick={() => setSales([...sales, { productId: firstProduct.id, quantity: "", unitPrice: soles(firstProduct.default_price_cents), shift: "PM" }])}><Plus size={18} /> Otra venta</button>
        </section>
        <section className="card p-5 sm:p-6"><h2 className="mb-1 text-lg font-extrabold">3. Panes no vendidos</h2><p className="mb-4 text-xs text-[var(--muted)]">Regalos y consumo se registran por turno.</p>{catalog.products.flatMap((product) => (["AM", "PM"] as const).map((shift) => { const key = `${shift}:${product.id}`; return <div key={key} className="mb-3 grid gap-2 sm:grid-cols-[1fr_1fr_1fr] sm:items-end"><span className="pb-3 text-sm font-bold">{product.name} · {shift}</span><label className={labelClass}>Regalados<input className={inputClass} inputMode="numeric" value={leftovers[key]?.gifted ?? ""} onChange={(event) => setLeftovers({ ...leftovers, [key]: { gifted: event.target.value, consumed: leftovers[key]?.consumed ?? "" } })} placeholder="0" /></label><label className={labelClass}>Consumidos / merma<input className={inputClass} inputMode="numeric" value={leftovers[key]?.consumed ?? ""} onChange={(event) => setLeftovers({ ...leftovers, [key]: { gifted: leftovers[key]?.gifted ?? "", consumed: event.target.value } })} placeholder="0" /></label></div>; }))}</section>
        <section className="card p-5 sm:p-6">
          <h2 className="text-lg font-extrabold">4. Reparto y crédito</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">Registra cada reparto en su turno. AM y PM pueden tener repartidores, panes y comisiones diferentes.</p>
          <div className="mt-4 space-y-3">{courierRuns.map((row, index) => <div key={row.key} className="rounded-xl bg-[var(--surface-muted)] p-3">
            <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-extrabold">Reparto {index + 1} · {row.shift}</h3><button type="button" className="grid min-h-11 min-w-11 place-items-center rounded-xl text-red-600" aria-label={`Quitar reparto ${index + 1}`} onClick={() => setCourierRuns((rows) => rows.filter((item) => item.key !== row.key))}><Trash2 size={18} /></button></div>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {selectShift(row.shift, (shift) => updateCourierRun(row.key, { shift }))}
              <label className={labelClass}>Repartidor<select className={inputClass} value={row.courierId} onChange={(event) => { const courierId = event.target.value; updateCourierRun(row.key, { courierId, commission: soles(catalog.couriers.find((item) => item.id === courierId)?.default_commission_cents ?? 0) }); }}>{catalog.couriers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              {selectProduct(row.productId, (productId) => updateCourierRun(row.key, { productId }))}
              <label className={labelClass}>Panes entregados<input className={inputClass} inputMode="numeric" value={row.delivered} onChange={(event) => updateCourierRun(row.key, { delivered: event.target.value })} /></label>
              <label className={labelClass}>Comisión por pan S/<input className={inputClass} inputMode="decimal" value={row.commission} onChange={(event) => updateCourierRun(row.key, { commission: event.target.value })} /></label>
              <label className={labelClass}>Comisión adicional S/<input className={inputClass} inputMode="decimal" value={row.extraCommission} onChange={(event) => updateCourierRun(row.key, { extraCommission: event.target.value })} /></label>
            </div>
          </div>)}</div>
          <button type="button" disabled={catalog.couriers.length === 0} className="mt-3 flex min-h-11 items-center gap-2 text-sm font-bold text-[var(--green-dark)] disabled:opacity-45" onClick={addCourierRun}><Plus size={18} /> Agregar reparto</button>
          {catalog.couriers.length === 0 && <p className="mt-1 text-xs text-[var(--muted)]">Agrega un repartidor activo en Configuración para registrar repartos.</p>}
          <label className="mt-4 flex min-h-11 items-center gap-3 text-sm font-semibold"><input type="checkbox" className="size-5 accent-[var(--green)]" checked={creditEnabled} onChange={(event) => setCreditEnabled(event.target.checked)} disabled={edit?.creditLocked} /> Hubo venta a crédito</label>
          {creditEnabled && <div className="mt-3 grid gap-3 rounded-xl bg-[var(--surface-muted)] p-3 sm:grid-cols-2"><label className={labelClass}>Importe pendiente S/<input className={inputClass} inputMode="decimal" value={creditAmount} onChange={(event) => setCreditAmount(event.target.value)} disabled={edit?.creditLocked} /></label><label className={labelClass}>Cliente o referencia<input className={inputClass} value={creditReference} onChange={(event) => setCreditReference(event.target.value)} disabled={edit?.creditLocked} maxLength={200} /></label></div>}
          {edit?.preserveCredits && <p className="mt-2 text-xs text-[var(--muted)]">Este cierre tiene varios créditos. Se conservan sin cambios; el total se muestra en la vista previa.</p>}
        </section>
        <section className="card p-5 sm:p-6">
          <h2 className="text-lg font-extrabold">5. Gastos y caja</h2>
          {expenses.map((row, index) => <div key={index} className="mt-3 grid gap-2 rounded-xl bg-[var(--surface-muted)] p-3 sm:grid-cols-2 lg:grid-cols-[1fr_1.5fr_1fr_1.3fr_auto]">
            {selectShift(row.shift, (shift) => setExpenses(expenses.map((item, at) => at === index ? { ...item, shift } : item)))}
            <label className={labelClass}>Concepto<input className={inputClass} value={row.concept} onChange={(event) => setExpenses(expenses.map((item, at) => at === index ? { ...item, concept: event.target.value } : item))} maxLength={120} /></label>
            <label className={labelClass}>Importe S/<input className={inputClass} inputMode="decimal" value={row.amount} onChange={(event) => setExpenses(expenses.map((item, at) => at === index ? { ...item, amount: event.target.value } : item))} /></label>
            <label className={labelClass}>Pagado por{selectPayer(row.payer, (value) => setExpenses(expenses.map((item, at) => at === index ? { ...item, payer: value } : item)))}</label>
            <button type="button" className="grid min-h-11 place-items-center rounded-xl text-red-600" aria-label="Quitar gasto" onClick={() => setExpenses(expenses.filter((_, at) => at !== index))}><Trash2 size={18} /></button>
          </div>)}
          <button type="button" className="mt-3 flex min-h-11 items-center gap-2 text-sm font-bold text-[var(--green-dark)]" onClick={() => setExpenses([...expenses, { concept: "", amount: "", payer: catalog.owners[0].id, shift: "AM" }])}><Plus size={18} /> Agregar gasto</button>
          <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className={labelClass}>Efectivo inicial en caja S/<input className={inputClass} inputMode="decimal" value={openingCash} onChange={(event) => setOpeningCash(event.target.value)} /></label><label className={labelClass}>Reservar en caja S/<input className={inputClass} inputMode="decimal" value={reservedCash} onChange={(event) => setReservedCash(event.target.value)} /></label></div>
          <label className={`${labelClass} mt-4`}>Notas opcionales<textarea className={`${inputClass} min-h-20 py-3`} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} /></label>
        </section>
        <section className="card p-5 sm:p-6" aria-label="Resultado por turno"><h2 className="text-lg font-extrabold">Resultado por turno</h2><p className="mt-1 text-xs text-[var(--muted)]">AM y PM suman un solo día operado.</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{shiftMetrics.map((item) => <div key={item.shift} className="rounded-xl bg-[var(--surface-muted)] p-4"><h3 className="font-black">{item.shift} · {item.shift === "AM" ? "Mañana" : "Tarde"}</h3><p className="mt-2 text-sm">{item.soldQuantity} panes vendidos · {formatMoney(item.salesCents)}</p><p className="text-xs text-[var(--muted)]">Compras registradas: {formatMoney(item.purchaseCostCents)}</p><p className="text-sm font-bold">Resultado contable: {formatMoney(item.profitCents)}</p>{!item.operated && <p className="mt-1 text-xs text-[var(--muted)]">Sin actividad registrada</p>}</div>)}</div><p className="mt-3 text-xs text-[var(--muted)]">Si panes comprados en AM se venden en PM, el costo queda en AM y la venta en PM. La utilidad fiable para repartir es la suma del día.</p></section>
      </div>
      <aside className="card p-5 xl:sticky xl:top-6" aria-label="Resumen del cierre"><h2 className="text-lg font-extrabold">Resumen en vivo</h2>{summary ? <><div className="mt-4 grid grid-cols-2 gap-3"><Metric label="Ventas" value={formatMoney(summary.salesCents)} color="green" /><Metric label="Utilidad" value={formatMoney(summary.economicProfitCents)} color="orange" /></div><dl className="mt-4 divide-y divide-[var(--border)] text-sm">{[["Panes comprados", String(summary.purchasedQuantity)], ["Panes vendidos", String(summary.soldQuantity)], ["Costo de compra", formatMoney(summary.purchaseCostCents)], ["Margen", summary.marginBps === null ? "—" : `${(summary.marginBps / 100).toFixed(2)}%`], ["Comisiones", formatMoney(summary.commissionCents)], ["Otros gastos", formatMoney(summary.expensesCents)], ["Crédito nuevo", formatMoney(summary.creditCents)], ["Cobros de créditos previos", formatMoney(summary.creditCollectionsCents)], ["Efectivo disponible", formatMoney(summary.cashAvailableCents)]].map(([label, value]) => <div className="flex justify-between gap-3 py-2" key={label}><dt className="text-[var(--muted)]">{label}</dt><dd className="font-bold">{value}</dd></div>)}</dl><div className="mt-3 space-y-1">{summary.balances.map((balance) => <p key={balance.productId} className={`text-xs font-bold ${balance.difference === 0 ? "text-[var(--green-dark)]" : "text-[#ad5a12]"}`}>{productName(balance.productId)}: {balance.difference === 0 ? "unidades cuadradas" : balance.difference > 0 ? `faltan justificar ${balance.difference}` : `sobran ${-balance.difference} en el registro`}</p>)}</div><div className="mt-5 rounded-xl bg-[var(--lavender-soft)] p-3"><h3 className="text-xs font-extrabold uppercase tracking-wide text-[#6652c4]">Liquidación de socios</h3>{summary.settlements.map((item) => <div key={item.ownerId} className="mt-3 border-t border-[#dcd5fc] pt-2 text-xs"><div className="flex justify-between font-extrabold"><span>{item.ownerName} ({item.shareBps / 100}%)</span><span>{formatMoney(item.totalCashDueCents)}</span></div><p className="mt-1 text-[#6652a6]">Aporte: {formatMoney(item.capitalContributedCents)} · Capital pendiente: {formatMoney(item.capitalPendingCents)} · Ganancia económica: {formatMoney(item.economicProfitShareCents)}</p></div>)}</div></> : <p className="mt-4 text-sm text-[var(--muted)]">Completa los valores para ver la liquidación.</p>}{errors.length > 0 && <div className="mt-4 rounded-xl bg-[var(--orange-soft)] p-3 text-xs text-[#8c591c]" role="alert"><div className="flex items-start gap-2 font-bold"><AlertCircle size={16} className="shrink-0" /> Revisa el cierre</div><ul className="mt-2 list-disc space-y-1 pl-5">{errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}{collectionsLoading && <p className="mt-3 text-xs text-[var(--muted)]">Cargando cobros previos…</p>}{collectionsError && <p className="mt-3 rounded-xl bg-red-50 p-3 text-xs text-red-700" role="alert">{collectionsError}</p>}{saveError && <p className="mt-4 rounded-xl bg-red-50 p-3 text-xs text-red-700" role="alert">{saveError}</p>}<button type="submit" disabled={!ready || preview || submitting} className="mt-5 min-h-12 w-full rounded-xl bg-[var(--green)] px-4 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-45">{submitting ? "Guardando…" : preview ? "Vista previa · no guarda" : edit ? "Guardar cambios" : "Guardar y cerrar día"}</button><p className="mt-2 text-center text-[0.7rem] leading-4 text-[var(--muted)]">{preview ? "Datos de ejemplo; no hay conexión ni guardado." : "El servidor valida y recalcula antes de confirmar."}</p></aside>
    </div>
  </form>;
}

function Metric({ label, value, color }: { label: string; value: string; color: "green" | "orange" }) {
  return <div className={`rounded-xl p-3 ${color === "green" ? "bg-[var(--green-soft)]" : "bg-[var(--orange-soft)]"}`}><p className="text-xs font-bold text-[var(--muted)]">{label}</p><p className="mt-1 text-lg font-black tracking-tight">{value}</p></div>;
}
