"use client";

import Link from "next/link";
import { DailyCloseForm } from "@/components/daily-close/daily-close-form";
import { useDemoSettings } from "@/components/preview/demo-settings";

export default function PreviewRegisterPage() {
  const { configuration } = useDemoSettings();
  const catalog = {
    products: configuration.products.filter((product) => product.active),
    couriers: configuration.couriers.filter((courier) => courier.active),
    owners: configuration.owners.filter((owner) => owner.active).map((owner) => ({
      id: owner.id, name: owner.name, shareBps: owner.profit_share_bps, sortOrder: owner.sort_order, priorCapitalCents: 0,
    })),
    defaults: configuration.defaults,
  };
  return <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8"><div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-white p-3 text-xs font-bold text-[var(--muted)]"><Link href="/vista-previa/configuracion/" className="text-[var(--green-dark)] underline">← Configurar socios y productos</Link><span>Demostración ficticia: el cierre no se guarda.</span></div><DailyCloseForm key={configuration.business.updated_at} catalog={catalog} preview /></main>;
}
