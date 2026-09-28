"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, CalendarDays, LoaderCircle, Pencil, Trash2 } from "lucide-react";
import { DailyCloseForm, type DailyCloseCatalog } from "@/components/daily-close/daily-close-form";
import { calculateShiftMetrics } from "@/lib/finance/calculations";
import { allocateCents, calculateSettlement } from "@/lib/finance/settlement";
import type { ClosureInput, Payer } from "@/lib/finance/types";
import { formatMoney } from "@/lib/format/money";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { deleteDailyClosure } from "@/lib/supabase/mutations/closures";
import { getBusinessContext } from "@/lib/supabase/queries/business";
import { getClosureDetail, type ClosureDetail } from "@/lib/supabase/queries/history";

function dateLabel(date: string) {
  return new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

function toPayer(type: "owner" | "business_cash", ownerId: string | null): Payer {
  return type === "owner" ? { type, ownerId: ownerId ?? "" } : { type, ownerId: null };
}

function prepareEditor(detail: ClosureDetail): { input: ClosureInput; catalog: DailyCloseCatalog } {
  const ownerInfo = new Map(detail.owners.map((owner) => [owner.id, owner]));
  const sortedSettlements = [...detail.settlements].sort((a, b) => (ownerInfo.get(a.owner_id)?.sort_order ?? 0) - (ownerInfo.get(b.owner_id)?.sort_order ?? 0));
  const owners = sortedSettlements.map((row) => ({
    id: row.owner_id,
    name: ownerInfo.get(row.owner_id)?.name ?? "Socio",
    shareBps: row.profit_share_bps,
    priorCapitalCents: row.capital_brought_forward_cents,
    sortOrder: ownerInfo.get(row.owner_id)?.sort_order ?? 0,
  }));
  const totalCredit = detail.credits.reduce((sum, credit) => sum + credit.amount_cents, 0);
  const stored = detail.closure.shift_payload as ClosureInput | null;
  const purchaseCostCents = detail.purchases.reduce((sum, row) => sum + row.quantity * row.unit_cost_cents, 0);
  const halfCost = allocateCents(purchaseCostCents, owners.map((owner) => ({ id: owner.id, weight: 1, sortOrder: owner.sortOrder })));
  const input: ClosureInput = {
    operatingDate: detail.closure.operating_date,
    purchases: stored?.purchases ?? detail.purchases.map((row) => ({ productId: row.product_id, quantity: row.quantity, unitCostCents: row.unit_cost_cents, shift: "AM" })),
    capitalContributions: stored?.capitalContributions ?? owners.map((owner) => ({ ownerId: owner.id, amountCents: halfCost[owner.id] })),
    businessPaidPurchasesCents: stored?.businessPaidPurchasesCents ?? 0,
    sales: stored?.sales ?? detail.sales.map((row) => ({ productId: row.product_id, quantity: row.quantity, unitPriceCents: row.unit_price_cents, shift: "AM" })),
    leftovers: stored?.leftovers ?? detail.leftovers.map((row) => ({ productId: row.product_id, giftedQuantity: row.gifted_quantity, consumedQuantity: row.consumed_quantity, shift: "AM" })),
    courierRuns: stored?.courierRuns ?? detail.couriers.map((row) => ({ productId: row.product_id, courierId: row.courier_id, deliveredQuantity: row.delivered_quantity, commissionPerUnitCents: row.commission_per_unit_cents, additionalCommissionCents: row.additional_commission_cents, shift: "AM" })),
    expenses: stored?.expenses ?? detail.expenses.map((row) => ({ concept: row.concept, amountCents: row.amount_cents, payer: toPayer(row.payer_type, row.owner_id), shift: "AM" })),
    credit: totalCredit > 0 ? { amountCents: totalCredit, reference: detail.credits.length === 1 ? detail.credits[0].reference ?? "" : "Varios créditos" } : null,
    creditCollectionsCents: detail.collectionsCents,
    owners,
    openingBusinessCashCents: detail.closure.opening_business_cash_cents,
    reservedBusinessCashCents: detail.closure.reserved_business_cash_cents,
    notes: detail.closure.notes ?? "",
  };
  const catalog: DailyCloseCatalog = {
    businessId: detail.closure.business_id,
    products: detail.products,
    couriers: detail.courierNames,
    owners,
    defaults: {
      usual_cost_cents: detail.products[0]?.default_cost_cents ?? 0,
      usual_price_cents: detail.products[0]?.default_price_cents ?? 0,
      usual_courier_commission_cents: detail.courierNames[0]?.default_commission_cents ?? 0,
    },
  };
  return { input, catalog };
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] py-3 last:border-b-0"><dt className="text-sm text-[var(--muted)]">{label}</dt><dd className="text-right text-sm font-bold">{value}</dd></div>;
}

export function ClosureDetailPage() {
  const [detail, setDetail] = useState<ClosureDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const id = new URLSearchParams(window.location.search).get("id");
        if (!id || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id)) throw new Error("Falta un identificador válido del cierre.");
        const user = await getAuthenticatedUser();
        if (!user) throw new Error("Inicia sesión para ver el cierre.");
        const { business } = await getBusinessContext(user.id);
        const result = await getClosureDetail(business.id, id);
        if (!result) throw new Error("No se encontró este cierre en tu negocio.");
        if (active) setDetail(result);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "No se pudo cargar el cierre.");
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, []);
  if (loading) return <div className="flex min-h-52 items-center justify-center gap-3 text-sm text-[var(--muted)]" role="status"><LoaderCircle className="animate-spin" size={19} /> Cargando detalle…</div>;
  if (error) return <div className="card flex items-start gap-3 p-5 text-sm text-red-700" role="alert"><AlertCircle size={20} />{error}</div>;
  if (!detail) return null;
  return <ClosureDetailView detail={detail} />;
}

export function ClosureDetailView({ detail, preview = false }: { detail: ClosureDetail; preview?: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const prepared = useMemo(() => prepareEditor(detail), [detail]);
  const productName = (id: string) => detail.products.find((item) => item.id === id)?.name ?? "Producto";
  const ownerName = (id: string | null) => detail.owners.find((item) => item.id === id)?.name ?? "Socio";
  const courierName = (id: string) => detail.courierNames.find((item) => item.id === id)?.name ?? "Repartidor";
  const payerName = (type: "owner" | "business_cash" | "joint", id: string | null) => type === "owner" ? ownerName(id) : type === "joint" ? "Aporte conjunto" : "Caja del negocio";
  const summary = detail.closure.shift_payload && prepared.input.owners.length === 2 ? calculateSettlement(prepared.input) : null;
  const shiftMetrics = detail.closure.shift_payload ? calculateShiftMetrics(prepared.input) : [];
  const creditTotal = detail.credits.reduce((sum, credit) => sum + credit.amount_cents, 0);
  const paidCredit = detail.payments.length > 0;
  const hasCollectedCredit = paidCredit || detail.credits.some((credit) => credit.status === "paid");

  async function removeDay() {
    if (preview || !confirmDelete || deleting || !detail.closure.shift_payload || hasCollectedCredit) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteDailyClosure(detail.closure.id, detail.closure.updated_at);
      router.replace("/historial");
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : "No se pudo eliminar el día.");
      setDeleting(false);
    }
  }

  if (editing) return <div><button type="button" onClick={() => setEditing(false)} className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[var(--green-dark)]"><ArrowLeft size={18} /> Cancelar edición</button><DailyCloseForm catalog={prepared.catalog} businessId={preview ? undefined : detail.closure.business_id} initialInput={prepared.input} preview={preview} edit={{ id: detail.closure.id, expectedUpdatedAt: detail.closure.updated_at, preserveCredits: detail.credits.length > 1, creditLocked: paidCredit || detail.credits.length > 1 }} /></div>;

  return <div>
    <Link href={preview ? "/vista-previa/historial" : "/historial"} className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[var(--green-dark)]"><ArrowLeft size={18} /> Volver al historial</Link>
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><span className="inline-block rounded-full bg-[var(--green-soft)] px-3 py-1 text-[0.7rem] font-extrabold uppercase tracking-wide text-[var(--green-dark)]">{preview ? "Demostración · día ficticio" : "Día cerrado"}</span><h1 className="mt-3 text-3xl font-black tracking-tight">{dateLabel(detail.closure.operating_date)}</h1><p className="mt-1 text-xs text-[var(--muted)]">Actualizado: {new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Lima" }).format(new Date(detail.closure.updated_at))}</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setEditing(true)} disabled={!summary || prepared.catalog.products.length === 0 || (!preview && !detail.closure.shift_payload)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--green)] px-5 text-sm font-bold text-white disabled:opacity-40"><Pencil size={16} /> Editar día</button>{!preview && detail.closure.shift_payload && <button type="button" onClick={() => { setConfirmDelete(true); setDeleteError(""); }} disabled={hasCollectedCredit} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-red-200 px-5 text-sm font-bold text-red-700 disabled:opacity-45"><Trash2 size={16} /> Eliminar día</button>}</div></header>
    {hasCollectedCredit && detail.closure.shift_payload && !preview && <p className="mb-5 text-sm text-[var(--muted)]">Este día tiene créditos cobrados; no se puede eliminar sin alterar esos cobros.</p>}
    {confirmDelete && <section className="card mb-5 border border-red-200 p-5" aria-label="Confirmar eliminación del día"><h2 className="text-lg font-extrabold text-red-800">¿Eliminar el {dateLabel(detail.closure.operating_date)}?</h2><p className="mt-2 text-sm text-[var(--muted)]">Se borrarán sus compras, ventas, repartos y créditos pendientes. La liquidación de los días posteriores se recalculará. Esta acción no se puede deshacer.</p>{deleteError && <p className="mt-3 text-sm text-red-700" role="alert">{deleteError}</p>}<div className="mt-4 flex flex-wrap gap-3"><button type="button" className="min-h-11 rounded-xl border border-[var(--border)] px-5 text-sm font-bold" onClick={() => setConfirmDelete(false)} disabled={deleting}>Cancelar</button><button type="button" className="min-h-11 rounded-xl bg-red-700 px-5 text-sm font-bold text-white disabled:opacity-45" onClick={removeDay} disabled={deleting}>{deleting ? "Eliminando…" : "Sí, eliminar día"}</button></div></section>}
    {summary && <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Resultado del día"><div className="card p-4"><p className="text-xs font-bold text-[var(--muted)]">Ventas</p><p className="mt-2 text-xl font-black">{formatMoney(summary.salesCents)}</p></div><div className="card p-4"><p className="text-xs font-bold text-[var(--muted)]">Utilidad económica</p><p className="mt-2 text-xl font-black">{formatMoney(summary.economicProfitCents)}</p></div><div className="card p-4"><p className="text-xs font-bold text-[var(--muted)]">Crédito nuevo</p><p className="mt-2 text-xl font-black">{formatMoney(creditTotal)}</p></div><div className="card p-4"><p className="text-xs font-bold text-[var(--muted)]">Cobros previos en caja</p><p className="mt-2 text-xl font-black">{formatMoney(detail.collectionsCents)}</p></div></section>}
    {shiftMetrics.length > 0 && <section className="mb-5 grid gap-3 sm:grid-cols-2" aria-label="Desglose por turno">{shiftMetrics.map((item) => <div key={item.shift} className="card p-4"><h2 className="text-sm font-extrabold">Turno {item.shift}</h2><p className="mt-2 text-sm">{item.soldQuantity} panes · ventas {formatMoney(item.salesCents)}</p><p className="text-xs text-[var(--muted)]">Compras registradas: {formatMoney(item.purchaseCostCents)}</p><p className="text-sm font-bold">Resultado contable {formatMoney(item.profitCents)}</p></div>)}</section>}
    {detail.closure.shift_payload && <section className="card mb-5 p-5" aria-label="Capital de compra"><h2 className="text-lg font-extrabold">Capital para la compra</h2><p className="mt-1 text-xs text-[var(--muted)]">La utilidad se reparte 50/50; el reembolso depende del efectivo realmente aportado.</p><dl className="mt-3">{prepared.input.capitalContributions.map((item) => <DetailRow key={item.ownerId} label={`Aportó ${ownerName(item.ownerId)}`} value={formatMoney(item.amountCents)} />)}<DetailRow label="Caja de AM usada en panes de PM" value={formatMoney(prepared.input.businessPaidPurchasesCents ?? 0)} /></dl></section>}
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="card p-5 sm:p-6"><h2 className="text-lg font-extrabold">Compra y ventas</h2><dl className="mt-3">{detail.closure.shift_payload ? <>{prepared.input.purchases.map((row, index) => <DetailRow key={`p-${index}`} label={`${row.shift} · ${productName(row.productId)} · ${row.quantity} comprados`} value={`${formatMoney(row.unitCostCents)} c/u`} />)}{prepared.input.sales.map((row, index) => <DetailRow key={`s-${index}`} label={`${row.shift} · ${productName(row.productId)} · ${row.quantity} vendidos`} value={`${formatMoney(row.unitPriceCents)} c/u`} />)}</> : <>{detail.purchases.map((row) => <DetailRow key={row.id} label={`${productName(row.product_id)} · ${row.quantity} comprados · ${payerName(row.payer_type, row.owner_id)}`} value={`${formatMoney(row.unit_cost_cents)} c/u`} />)}{detail.sales.map((row) => <DetailRow key={row.id} label={`${productName(row.product_id)} · ${row.quantity} vendidos`} value={`${formatMoney(row.unit_price_cents)} c/u`} />)}</>}</dl>{detail.sales.length === 0 && <p className="mt-3 text-sm text-[var(--muted)]">Día cerrado sin ventas.</p>}</section>
      <section className="card p-5 sm:p-6"><h2 className="text-lg font-extrabold">Panes y reparto</h2><dl className="mt-3">{detail.leftovers.map((row) => <DetailRow key={row.id} label={productName(row.product_id)} value={`${row.gifted_quantity} regalados · ${row.consumed_quantity} consumidos`} />)}{detail.closure.shift_payload ? prepared.input.courierRuns.map((row, index) => <DetailRow key={`courier-${index}`} label={`${row.shift} · ${courierName(row.courierId)} · ${row.deliveredQuantity} entregados`} value={formatMoney(row.deliveredQuantity * row.commissionPerUnitCents + row.additionalCommissionCents)} />) : detail.couriers.map((row) => <DetailRow key={row.id} label={`${courierName(row.courier_id)} · ${row.delivered_quantity} entregados`} value={formatMoney(row.delivered_quantity * row.commission_per_unit_cents + row.additional_commission_cents)} />)}</dl>{detail.couriers.length === 0 && <p className="mt-3 text-sm text-[var(--muted)]">Sin reparto registrado.</p>}</section>
      <section className="card p-5 sm:p-6"><h2 className="text-lg font-extrabold">Gastos y caja</h2><dl className="mt-3">{detail.expenses.map((row) => <DetailRow key={row.id} label={`${row.concept} · ${payerName(row.payer_type, row.owner_id)}`} value={formatMoney(row.amount_cents)} />)}<DetailRow label="Caja inicial" value={formatMoney(detail.closure.opening_business_cash_cents)} /><DetailRow label="Caja reservada" value={formatMoney(detail.closure.reserved_business_cash_cents)} />{summary && <DetailRow label="Efectivo disponible para liquidar" value={formatMoney(summary.cashAvailableCents)} />}</dl>{detail.closure.notes && <p className="mt-4 rounded-xl bg-[var(--surface-muted)] p-3 text-sm text-[var(--muted)]">{detail.closure.notes}</p>}</section>
      <section className="card p-5 sm:p-6"><h2 className="text-lg font-extrabold">Créditos y liquidación</h2><dl className="mt-3">{detail.credits.map((credit) => <DetailRow key={credit.id} label={`${credit.reference || "Sin referencia"} · ${credit.status === "paid" ? "Pagado" : "Pendiente"}`} value={formatMoney(credit.amount_cents)} />)}{detail.settlements.map((line) => <DetailRow key={line.id} label={`${ownerName(line.owner_id)} · capital ${formatMoney(line.capital_reimbursed_cents)} + efectivo ${formatMoney(line.cash_profit_distributed_cents)}`} value={formatMoney(line.total_cash_due_cents)} />)}</dl>{detail.credits.length === 0 && <p className="mt-3 text-sm text-[var(--muted)]">Sin ventas a crédito.</p>}<Link href={preview ? "/vista-previa/creditos" : "/creditos"} className="mt-4 inline-flex min-h-11 items-center text-sm font-bold text-[var(--green-dark)]">Ver créditos →</Link></section>
    </div>
    <p className="mt-5 flex items-start gap-2 text-xs leading-5 text-[var(--muted)]"><CalendarDays size={16} className="shrink-0" /> Editar este día recalcula su liquidación y las posteriores. El servidor rechaza cambios si otro usuario modificó el cierre mientras estaba abierto.</p>
  </div>;
}
