import { addDays, mondayOf, monthStart } from "../dates/lima";
import { summarize, type ClosureFacts } from "../dashboard/metrics";
import { courierWorkedMinutes } from "../couriers/time";

export type ReportPreset = "this-week" | "last-week" | "this-month" | "last-month" | "custom";
export type ReportSelection = { preset: ReportPreset; start?: string; end?: string };
export type ReportRange = { start: string; end: string };
export type ShiftFact = { date: string; shift: "AM" | "PM"; soldQuantity: number; salesCents: number; profitCents: number | null };
export type CourierReportRun = {
  date: string; courierId: string; courierName: string; shift: "AM" | "PM";
  deliveredQuantity: number; commissionCents: number;
  startTime?: string; endTime?: string;
};

export type WeeklyCourierRankingRow = {
  id: string; name: string; AM: number; PM: number; workedMinutes: number;
  weightedQuarterUnits: number; pointsPerHour: number | null;
  status: "eligible" | "under-minimum" | "missing-hours";
};

export function rankWeeklyCouriers(runs: CourierReportRun[], today: string): WeeklyCourierRankingRow[] {
  const monday = mondayOf(today);
  const grouped = new Map<string, {
    id: string; name: string; AM: number; PM: number;
    sessions: Map<string, { times: string; minutes: number | null }>;
  }>();
  for (const run of runs) {
    if (run.date < monday || run.date > today) continue;
    const item = grouped.get(run.courierId) ?? {
      id: run.courierId, name: run.courierName, AM: 0, PM: 0,
      sessions: new Map<string, { times: string; minutes: number | null }>(),
    };
    item.name = run.courierName;
    item[run.shift] += run.deliveredQuantity;
    const key = `${run.date}:${run.shift}`;
    const times = `${run.startTime ?? ""}-${run.endTime ?? ""}`;
    const minutes = courierWorkedMinutes(run.startTime, run.endTime);
    const prior = item.sessions.get(key);
    item.sessions.set(key, { times, minutes: prior && (prior.times !== times || prior.minutes === null) ? null : minutes });
    grouped.set(run.courierId, item);
  }
  return [...grouped.values()].map((item): WeeklyCourierRankingRow => {
    const sessions = [...item.sessions.values()];
    const missingHours = sessions.some((session) => session.minutes === null);
    const workedMinutes = sessions.reduce((sum, session) => sum + (session.minutes ?? 0), 0);
    const weightedQuarterUnits = item.AM * 5 + item.PM * 4;
    const status = missingHours ? "missing-hours" : workedMinutes < 120 ? "under-minimum" : "eligible";
    return { id: item.id, name: item.name, AM: item.AM, PM: item.PM, workedMinutes,
      weightedQuarterUnits, pointsPerHour: status === "eligible" ? weightedQuarterUnits * 15 / workedMinutes : null, status };
  }).sort((a, b) => {
    if (a.status !== b.status) return a.status === "eligible" ? -1 : b.status === "eligible" ? 1 : a.status === "under-minimum" ? -1 : 1;
    if (a.status === "eligible" && b.status === "eligible") {
      const byRate = b.weightedQuarterUnits * a.workedMinutes - a.weightedQuarterUnits * b.workedMinutes;
      if (byRate !== 0) return byRate;
    }
    return b.weightedQuarterUnits - a.weightedQuarterUnits || a.name.localeCompare(b.name, "es");
  });
}

export function summarizeCouriers(runs: CourierReportRun[]) {
  const grouped = new Map<string, {
    id: string; name: string; dates: Set<string>;
    AM: { deliveredQuantity: number; commissionCents: number };
    PM: { deliveredQuantity: number; commissionCents: number };
  }>();
  for (const run of runs) {
    const item = grouped.get(run.courierId) ?? {
      id: run.courierId, name: run.courierName, dates: new Set<string>(),
      AM: { deliveredQuantity: 0, commissionCents: 0 },
      PM: { deliveredQuantity: 0, commissionCents: 0 },
    };
    item.dates.add(run.date);
    item[run.shift].deliveredQuantity += run.deliveredQuantity;
    item[run.shift].commissionCents += run.commissionCents;
    item.name = run.courierName;
    grouped.set(run.courierId, item);
  }
  return [...grouped.values()].map(({ dates, ...item }) => ({
    ...item, operatedDays: dates.size,
    deliveredQuantity: item.AM.deliveredQuantity + item.PM.deliveredQuantity,
    commissionCents: item.AM.commissionCents + item.PM.commissionCents,
  })).sort((a, b) => b.deliveredQuantity - a.deliveredQuantity || a.name.localeCompare(b.name, "es"));
}

export function summarizeShifts(facts: ShiftFact[]) {
  return (["AM", "PM"] as const).map((shift) => {
    const rows = facts.filter((fact) => fact.shift === shift);
    return {
      shift,
      operatedShifts: new Set(rows.map((row) => row.date)).size,
      soldQuantity: rows.reduce((sum, row) => sum + row.soldQuantity, 0),
      salesCents: rows.reduce((sum, row) => sum + row.salesCents, 0),
      profitCents: rows.some((row) => row.profitCents === null) ? null : rows.reduce((sum, row) => sum + (row.profitCents ?? 0), 0),
      averageSalesCents: rows.length ? Math.round(rows.reduce((sum, row) => sum + row.salesCents, 0) / rows.length) : null,
    };
  });
}

export function summarizeWeekdayShifts(facts: ShiftFact[], range: ReportRange) {
  const byDateAndShift = new Map<string, { date: string; shift: ShiftFact["shift"]; salesCents: number; soldQuantity: number }>();
  for (const fact of facts) {
    if (fact.date < range.start || fact.date > range.end) continue;
    const key = `${fact.date}:${fact.shift}`;
    const previous = byDateAndShift.get(key);
    byDateAndShift.set(key, {
      date: fact.date,
      shift: fact.shift,
      salesCents: (previous?.salesCents ?? 0) + fact.salesCents,
      soldQuantity: (previous?.soldQuantity ?? 0) + fact.soldQuantity,
    });
  }
  const rows = [...byDateAndShift.values()];
  return Array.from({ length: 7 }, (_, index) => {
    const summarizeShift = (shift: ShiftFact["shift"]) => {
      const matches = rows.filter((row) => row.shift === shift && weekdayIndex(row.date) === index);
      return {
        count: matches.length,
        salesCents: matches.length ? Math.round(matches.reduce((sum, row) => sum + row.salesCents, 0) / matches.length) : null,
        soldQuantity: matches.length ? Math.round(matches.reduce((sum, row) => sum + row.soldQuantity, 0) / matches.length * 10) / 10 : null,
      };
    };
    return { index, AM: summarizeShift("AM"), PM: summarizeShift("PM") };
  });
}

export function resolveReportRange(selection: ReportSelection, today: string): ReportRange {
  const thisMonday = mondayOf(today);
  const thisMonth = monthStart(today);
  switch (selection.preset) {
    case "this-week": return { start: thisMonday, end: today };
    case "last-week": return { start: addDays(thisMonday, -7), end: addDays(thisMonday, -1) };
    case "this-month": return { start: thisMonth, end: today };
    case "last-month": return { start: monthStart(addDays(thisMonth, -1)), end: addDays(thisMonth, -1) };
    case "custom": {
      const { start, end } = selection;
      const validDate = (value: string | undefined) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value)
        && !Number.isNaN(Date.parse(`${value}T12:00:00Z`))
        && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value);
      if (!validDate(start) || !validDate(end) || !start || !end
        || start > end || end > today || Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`) > 365 * 86400000) {
        throw new Error("Elige un rango válido de hasta 366 días, sin fechas futuras.");
      }
      return { start, end };
    }
  }
}

export function weeklyComparisonRange(today: string) {
  const currentStart = mondayOf(today);
  const previousStart = addDays(currentStart, -7);
  const elapsedDays = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${currentStart}T12:00:00Z`)) / 86400000);
  return { currentStart, currentEnd: today, previousStart, previousEnd: addDays(previousStart, elapsedDays) };
}

function weekdayIndex(date: string) {
  return (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
}

export function buildReport(periodFacts: ClosureFacts[], weeklyFacts: ClosureFacts[], range: ReportRange, today: string) {
  const days = periodFacts.filter((day) => day.date >= range.start && day.date <= range.end);
  const total = summarize(days);
  const commissionCents = days.reduce((sum, day) => sum + day.commissionCents, 0);
  const purchaseCostCents = days.reduce((sum, day) => sum + day.purchaseCostCents, 0);
  const purchasedQuantity = days.reduce((sum, day) => sum + day.purchasedQuantity, 0);
  const averages = {
    salesCents: days.length ? Math.round(total.salesCents / days.length) : null,
    profitCents: days.length ? Math.round(total.profitCents / days.length) : null,
    priceCents: total.soldQuantity ? Math.round(total.salesCents / total.soldQuantity) : null,
    costCents: purchasedQuantity ? Math.round(purchaseCostCents / purchasedQuantity) : null,
  };
  const weekdays = Array.from({ length: 7 }, (_, index) => {
    const matches = days.filter((day) => weekdayIndex(day.date) === index);
    return {
      index, count: matches.length,
      salesCents: matches.length ? Math.round(matches.reduce((sum, day) => sum + day.salesCents, 0) / matches.length) : null,
      soldQuantity: matches.length ? Math.round(matches.reduce((sum, day) => sum + day.soldQuantity, 0) / matches.length * 10) / 10 : null,
      profitCents: matches.length ? Math.round(matches.reduce((sum, day) => sum + day.profitCents, 0) / matches.length) : null,
    };
  });
  const weekRange = weeklyComparisonRange(today);
  const current = weeklyFacts.filter((day) => day.date >= weekRange.currentStart && day.date <= weekRange.currentEnd);
  const previous = weeklyFacts.filter((day) => day.date >= weekRange.previousStart && day.date <= weekRange.previousEnd);
  const sameWeekdays = current.map((day) => weekdayIndex(day.date)).sort().join(",") === previous.map((day) => weekdayIndex(day.date)).sort().join(",");
  return {
    days, total, commissionCents, averages, weekdays,
    comparison: {
      current: summarize(current), previous: summarize(previous),
      comparable: current.length >= 2 && sameWeekdays,
    },
  };
}
