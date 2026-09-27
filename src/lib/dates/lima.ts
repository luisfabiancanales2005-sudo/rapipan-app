export function todayInLima(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function mondayOf(isoDate: string): string {
  const day = new Date(`${isoDate}T12:00:00Z`).getUTCDay();
  return addDays(isoDate, -(day === 0 ? 6 : day - 1));
}

export function monthStart(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`;
}
