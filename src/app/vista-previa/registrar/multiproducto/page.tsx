import Link from "next/link";
import { DailyCloseForm } from "@/components/daily-close/daily-close-form";
import { previewCatalog } from "@/lib/preview/catalog";

const twoProductCatalog = { ...previewCatalog, products: [...previewCatalog.products, {
  id: "00000000-0000-4000-8000-000000000022", name: "Producto de prueba", default_cost_cents: 300, default_price_cents: 500,
}] };

export default function MultiProductPreviewPage() {
  return <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8"><div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-white p-3 text-xs font-bold text-[var(--muted)]"><Link href="/vista-previa/configuracion/" className="text-[var(--green-dark)] underline">← Configuración de prueba</Link><span>2 productos ficticios: el selector debe aparecer. El segundo producto solo existe en esta demostración.</span></div><DailyCloseForm catalog={twoProductCatalog} preview /></main>;
}
