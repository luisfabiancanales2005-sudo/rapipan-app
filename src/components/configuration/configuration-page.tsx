"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, LoaderCircle, Plus, Save, Trash2 } from "lucide-react";
import { formatMoney, parseMoney } from "@/lib/format/money";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { saveConfiguration } from "@/lib/supabase/mutations/configuration";
import { getBusinessContext } from "@/lib/supabase/queries/business";
import { getConfiguration, type Configuration } from "@/lib/supabase/queries/configuration";
import { validateConfiguration, type ConfigurationPayload } from "@/lib/validation/configuration";

type OwnerDraft = { id: string; name: string; percent: string };
type ProductDraft = { key: string; id: string | null; name: string; active: boolean; cost: string; price: string };
type CourierDraft = { key: string; id: string | null; name: string; active: boolean; commission: string };
const moneyInput = "min-h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3 text-sm font-semibold outline-none focus:border-[var(--green)] focus:ring-2 focus:ring-[var(--green-soft)]";
const label = "grid gap-1.5 text-xs font-bold text-[var(--muted)]";
const soles = (cents: number) => (cents / 100).toFixed(2);
const newKey = () => globalThis.crypto?.randomUUID?.() ?? String(Date.now() + Math.random());

export function ConfigurationPageContent() {
  const [config, setConfig] = useState<Configuration | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const user = await getAuthenticatedUser();
        if (!user) throw new Error("Inicia sesión para configurar el negocio.");
        const { business } = await getBusinessContext(user.id);
        const result = await getConfiguration(business.id);
        if (active) setConfig(result);
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "No se pudo cargar la configuración."); }
    }
    void load();
    return () => { active = false; };
  }, []);
  if (error && !config) return <div className="card flex gap-3 p-6 text-sm text-red-700" role="alert"><AlertCircle size={20} />{error}</div>;
  if (!config) return <div className="flex items-center gap-3 text-sm text-[var(--muted)]" role="status"><LoaderCircle size={19} className="animate-spin" /> Cargando configuración…</div>;
  return <ConfigurationView key={config.business.updated_at} config={config} message={message} onSave={async (payload) => {
    await saveConfiguration(config.business.updated_at, payload);
    setConfig(await getConfiguration(config.business.id));
    setMessage("Configuración guardada. Los cierres anteriores conservan sus importes.");
  }} />;
}

export function ConfigurationView({ config, preview = false, message = "", onSave }: {
  config: Configuration; preview?: boolean; message?: string; onSave?: (payload: ConfigurationPayload) => Promise<void>;
}) {
  const [name, setName] = useState(config.business.name);
  const [usualCost, setUsualCost] = useState(soles(config.defaults.usual_cost_cents));
  const [usualPrice, setUsualPrice] = useState(soles(config.defaults.usual_price_cents));
  const [usualCommission, setUsualCommission] = useState(soles(config.defaults.usual_courier_commission_cents));
  const [owners, setOwners] = useState<OwnerDraft[]>(config.owners.filter((owner) => owner.active).map((owner) => ({ id: owner.id, name: owner.name, percent: soles(owner.profit_share_bps) })));
  const [products, setProducts] = useState<ProductDraft[]>(config.products.map((product) => ({ key: product.id, id: product.id, name: product.name, active: product.active, cost: soles(product.default_cost_cents), price: soles(product.default_price_cents) })));
  const [couriers, setCouriers] = useState<CourierDraft[]>(config.couriers.map((courier) => ({ key: courier.id, id: courier.id, name: courier.name, active: courier.active, commission: soles(courier.default_commission_cents) })));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const activeProducts = products.filter((product) => product.active).length;
  const totalShares = owners.reduce((sum, owner) => sum + (parseMoney(owner.percent) ?? 0), 0);
  const setProduct = (key: string, update: Partial<ProductDraft>) => setProducts((rows) => rows.map((row) => row.key === key ? { ...row, ...update } : row));
  const setCourier = (key: string, update: Partial<CourierDraft>) => setCouriers((rows) => rows.map((row) => row.key === key ? { ...row, ...update } : row));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const money = [usualCost, usualPrice, usualCommission, ...products.flatMap((product) => [product.cost, product.price]), ...couriers.map((courier) => courier.commission)];
    if (money.some((value) => parseMoney(value) === null) || owners.some((owner) => parseMoney(owner.percent) === null)) {
      setError("Usa importes y porcentajes válidos, con máximo dos decimales."); return;
    }
    const payload: ConfigurationPayload = {
      name: name.trim(), usualCostCents: parseMoney(usualCost)!, usualPriceCents: parseMoney(usualPrice)!,
      usualCourierCommissionCents: parseMoney(usualCommission)!,
      owners: owners.map((owner) => ({ id: owner.id, name: owner.name.trim(), shareBps: parseMoney(owner.percent)! })),
      products: products.map((product) => ({ id: product.id, name: product.name.trim(), active: product.active, defaultCostCents: parseMoney(product.cost)!, defaultPriceCents: parseMoney(product.price)! })),
      couriers: couriers.map((courier) => ({ id: courier.id, name: courier.name.trim(), active: courier.active, defaultCommissionCents: parseMoney(courier.commission)! })),
    };
    const issues = validateConfiguration(payload);
    if (issues.length) { setError(issues.join(" ")); return; }
    if (preview) { setError("Demostración: puedes probar los campos, pero no se guardan datos."); return; }
    if (!onSave) return;
    setError(""); setSaving(true);
    try { await onSave(payload); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo guardar la configuración."); }
    finally { setSaving(false); }
  }

  return <form onSubmit={submit} noValidate className="space-y-5 pb-5">
    <header><span className="inline-block rounded-full bg-[var(--green-soft)] px-3 py-1 text-[0.7rem] font-extrabold uppercase tracking-wide text-[var(--green-dark)]">Administración</span><h1 className="mt-3 text-3xl font-black tracking-tight">Configuración</h1><p className="mt-1 text-sm text-[var(--muted)]">Cambia nombres y valores habituales sin alterar los importes de días cerrados.</p>{preview && <p className="mt-2 text-xs font-bold text-[#8c591c]">Demostración · los cambios no se guardan</p>}</header>
    {message && <p className="flex items-center gap-2 rounded-xl bg-[var(--green-soft)] p-4 text-sm font-bold text-[var(--green-dark)]" role="status"><CheckCircle2 size={19} />{message}</p>}
    <div className="grid gap-5 xl:grid-cols-2"><section className="card p-5 sm:p-6"><h2 className="text-lg font-black">Negocio</h2><label className={`${label} mt-4`}>Nombre<input className={moneyInput} value={name} onChange={(event) => setName(event.target.value)} maxLength={100} /></label><p className="mt-3 text-xs text-[var(--muted)]">Moneda: soles (PEN) · zona horaria: Lima.</p></section><section className="card p-5 sm:p-6"><h2 className="text-lg font-black">Valores por defecto</h2><p className="mt-1 text-xs text-[var(--muted)]">Se usan como base al crear productos o repartidores; cada uno puede tener sus propios valores.</p><div className="mt-4 grid gap-3 sm:grid-cols-3"><label className={label}>Costo S/<input className={moneyInput} inputMode="decimal" value={usualCost} onChange={(event) => setUsualCost(event.target.value)} /></label><label className={label}>Precio S/<input className={moneyInput} inputMode="decimal" value={usualPrice} onChange={(event) => setUsualPrice(event.target.value)} /></label><label className={label}>Comisión S/<input className={moneyInput} inputMode="decimal" value={usualCommission} onChange={(event) => setUsualCommission(event.target.value)} /></label></div></section></div>
    <section className="card p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-black">Socios</h2><span className={`text-xs font-extrabold ${totalShares === 10000 ? "text-[var(--green-dark)]" : "text-red-700"}`}>Total: {(totalShares / 100).toFixed(2)}%</span></div><p className="mt-1 text-xs text-[var(--muted)]">La utilidad se divide siempre 50/50. Un adelanto desigual se registra en el cierre como aporte real y se reembolsa antes de repartir la utilidad.</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{owners.map((owner) => <div key={owner.id} className="grid gap-3 rounded-xl bg-[var(--surface-muted)] p-3 sm:grid-cols-[1fr_7rem]"><label className={label}>Nombre<input className={moneyInput} value={owner.name} maxLength={100} onChange={(event) => setOwners((rows) => rows.map((row) => row.id === owner.id ? { ...row, name: event.target.value } : row))} /></label><label className={label}>Utilidad %<input className={moneyInput} value={owner.percent} disabled /></label></div>)}</div></section>
    <section className="card p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-black">Productos</h2><p className="mt-1 text-xs text-[var(--muted)]">{activeProducts} {activeProducts === 1 ? "producto activo" : "productos activos"}. Con uno, el selector del cierre se oculta.</p></div><button type="button" onClick={() => setProducts((rows) => [...rows, { key: newKey(), id: null, name: "", active: true, cost: usualCost, price: usualPrice }])} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--green-soft)] px-4 text-xs font-extrabold text-[var(--green-dark)]"><Plus size={17} /> Agregar producto</button></div><div className="mt-4 space-y-3">{products.map((product) => <div key={product.key} className="grid gap-3 rounded-xl bg-[var(--surface-muted)] p-3 sm:grid-cols-[minmax(9rem,1fr)_7rem_7rem_auto]"><label className={label}>Nombre<input className={moneyInput} value={product.name} maxLength={100} onChange={(event) => setProduct(product.key, { name: event.target.value })} /></label><label className={label}>Costo S/<input className={moneyInput} inputMode="decimal" value={product.cost} onChange={(event) => setProduct(product.key, { cost: event.target.value })} /></label><label className={label}>Precio S/<input className={moneyInput} inputMode="decimal" value={product.price} onChange={(event) => setProduct(product.key, { price: event.target.value })} /></label><div className="flex items-end gap-2"><label className="flex min-h-11 items-center gap-2 text-xs font-bold"><input type="checkbox" checked={product.active} onChange={(event) => setProduct(product.key, { active: event.target.checked })} className="size-4 accent-[var(--green)]" /> Activo</label>{product.id === null && <button type="button" title="Quitar producto sin guardar" aria-label="Quitar producto sin guardar" onClick={() => setProducts((rows) => rows.filter((row) => row.key !== product.key))} className="grid size-11 place-items-center text-red-600"><Trash2 size={17} /></button>}</div></div>)}</div><p className="mt-3 text-xs text-[var(--muted)]">Un producto guardado se desactiva, no se borra: así los cierres históricos conservan su referencia.</p>{preview && <div className="mt-3 flex flex-wrap gap-3 text-xs font-bold text-[var(--green-dark)]"><Link href="/vista-previa/registrar/" className="underline">Probar cierre con 1 producto</Link><Link href="/vista-previa/registrar/multiproducto/" className="underline">Probar cierre con 2 productos</Link></div>}</section>
    <section className="card p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-black">Repartidores</h2><p className="mt-1 text-xs text-[var(--muted)]">Comisión habitual por pan entregado.</p></div><button type="button" onClick={() => setCouriers((rows) => [...rows, { key: newKey(), id: null, name: "", active: true, commission: usualCommission }])} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--green-soft)] px-4 text-xs font-extrabold text-[var(--green-dark)]"><Plus size={17} /> Agregar repartidor</button></div><div className="mt-4 space-y-3">{couriers.map((courier) => <div key={courier.key} className="grid gap-3 rounded-xl bg-[var(--surface-muted)] p-3 sm:grid-cols-[minmax(9rem,1fr)_9rem_auto]"><label className={label}>Nombre<input className={moneyInput} value={courier.name} maxLength={100} onChange={(event) => setCourier(courier.key, { name: event.target.value })} /></label><label className={label}>Comisión S/<input className={moneyInput} inputMode="decimal" value={courier.commission} onChange={(event) => setCourier(courier.key, { commission: event.target.value })} /></label><div className="flex items-end gap-2"><label className="flex min-h-11 items-center gap-2 text-xs font-bold"><input type="checkbox" checked={courier.active} onChange={(event) => setCourier(courier.key, { active: event.target.checked })} className="size-4 accent-[var(--green)]" /> Activo</label>{courier.id === null && <button type="button" title="Quitar repartidor sin guardar" aria-label="Quitar repartidor sin guardar" onClick={() => setCouriers((rows) => rows.filter((row) => row.key !== courier.key))} className="grid size-11 place-items-center text-red-600"><Trash2 size={17} /></button>}</div></div>)}</div><p className="mt-3 text-xs text-[var(--muted)]">Los repartidores con historial se desactivan en lugar de borrarse.</p></section>
    {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</p>}
    <div className="flex flex-wrap items-center gap-4"><button type="submit" disabled={saving} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[var(--green)] px-6 text-sm font-extrabold text-white disabled:opacity-50">{saving ? <LoaderCircle size={18} className="animate-spin" /> : <Save size={18} />}{preview ? "Probar validación" : "Guardar configuración"}</button><span className="text-xs text-[var(--muted)]">{preview ? "No se conecta a Supabase." : `Valores actuales: ${formatMoney(config.defaults.usual_cost_cents)} costo · ${formatMoney(config.defaults.usual_price_cents)} precio.`}</span></div>
  </form>;
}
