import type { Shift } from "../finance/types";

export const DEFAULT_COURIER_TIMES: Record<Shift, { startTime: string; endTime: string }> = {
  AM: { startTime: "09:00", endTime: "12:00" },
  PM: { startTime: "16:00", endTime: "20:00" },
};

export function courierWorkedMinutes(startTime: string | undefined, endTime: string | undefined): number | null {
  if (!startTime || !endTime || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)) return null;
  const [startHours, startMinutes] = startTime.split(":").map(Number);
  const [endHours, endMinutes] = endTime.split(":").map(Number);
  const minutes = endHours * 60 + endMinutes - startHours * 60 - startMinutes;
  return minutes > 0 && minutes <= 12 * 60 ? minutes : null;
}

export function formatWorkedMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} h ${String(remainder).padStart(2, "0")} min` : `${hours} h`;
}
