import Link from "next/link";
import { DailyCloseForm } from "@/components/daily-close/daily-close-form";
import { previewCatalog } from "@/lib/preview/catalog";

export default function PreviewRegisterPage() {
  return <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8"><div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-white p-3 text-xs font-bold text-[var(--muted)]"><Link href="/vista-previa/configuracion/" className="text-[var(--green-dark)] underline">← Configuración de prueba</Link><span>1 producto ficticio: el selector debe estar oculto.</span></div><DailyCloseForm catalog={previewCatalog} preview /></main>;
}
