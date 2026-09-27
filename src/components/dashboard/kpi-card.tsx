import { CircleDollarSign, HandCoins, ShoppingBasket, UsersRound } from "lucide-react";

const icons = { sales: CircleDollarSign, units: ShoppingBasket, profit: HandCoins, owner: UsersRound };
const tones = {
  green: "bg-[linear-gradient(135deg,#f4fbf6,#e6f6ec)] text-[var(--green)]",
  lime: "bg-[linear-gradient(135deg,#fbfcf4,#eef7e7)] text-[#df7c25]",
  orange: "bg-[linear-gradient(135deg,#fffaf2,#fff0dc)] text-[var(--orange)]",
  lavender: "bg-[linear-gradient(135deg,#faf8ff,#eeeaff)] text-[var(--lavender)]",
};

export function KpiCard({ metric }: { metric: {
  key: keyof typeof icons;
  label: string;
  value: string;
  comparison: number | null;
  tone: keyof typeof tones;
} }) {
  const Icon = icons[metric.key];
  const change = metric.comparison;
  return <article className={`min-h-36 rounded-[1.25rem] p-4 sm:p-5 ${tones[metric.tone]}`}>
    <div className="flex items-center gap-2.5 text-[var(--text)]"><span className="grid size-8 place-items-center rounded-full bg-white/80 text-current shadow-sm"><Icon aria-hidden="true" size={17} strokeWidth={2.3} /></span><h2 className="text-xs font-bold sm:text-sm">{metric.label}</h2></div>
    <p className="mt-4 text-[1.65rem] font-black tracking-[-0.055em] text-[var(--text)] sm:text-[2rem]">{metric.value}</p>
    <p className="mt-2 text-xs font-semibold text-[var(--muted)]">
      {change === null ? "Sin comparación" : <span className={change >= 0 ? "text-[var(--green-dark)]" : "text-[#b05a31]"}>{change > 0 ? "+" : ""}{change.toFixed(1)}% <span className="font-medium text-[var(--muted)]">vs hace 7 días</span></span>}
    </p>
  </article>;
}
