import { Boxes, Wheat } from "lucide-react";

export function Brand({ compact = false, preview = false }: { compact?: boolean; preview?: boolean }) {
  return (
    <div className="flex items-center gap-2.5" aria-label={preview ? "Demo de ventas" : "Rapipan Admin"}>
      <span className="grid size-10 place-items-center rounded-2xl bg-[var(--orange-soft)] text-[var(--orange)]">
        {preview ? <Boxes aria-hidden="true" size={22} strokeWidth={2.2} /> : <Wheat aria-hidden="true" size={22} strokeWidth={2.2} />}
      </span>
      {!compact && (
        <span className="leading-none">
          <span className="block font-serif text-[1.65rem] font-black tracking-[-0.055em] text-[#4a1718]">
            {preview ? "Demo de ventas" : "Rapipan"}
          </span>
          <span className="mt-1 block text-center text-[0.54rem] font-bold tracking-[0.34em] text-[var(--muted)]">
            {preview ? "EJEMPLO" : "ADMIN"}
          </span>
        </span>
      )}
    </div>
  );
}
