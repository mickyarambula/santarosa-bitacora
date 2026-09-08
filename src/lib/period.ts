import { z } from "zod";
import { appDateKey, parseLocalDateTime } from "./datetime";
import { weekRange } from "./weekly-dates";

export const periodSchema = z.object({
  period: z.enum(["hoy", "semana", "anterior", "mes", "personalizado", "todo"]).optional(),
  from: z.string().max(10).optional(),
  until: z.string().max(10).optional(),
});
export type PeriodSelection = z.infer<typeof periodSchema>;
export function dateBoundary(value: string) {
  const d = parseLocalDateTime(value + "T00:00");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(d.getTime()))
    throw new Error("Elige una fecha válida.");
  return d;
}
export function periodRange(selection: PeriodSelection, date = appDateKey(new Date())) {
  const day = dateBoundary(date);
  const period = selection.period ?? "semana";
  if (period === "semana") return weekRange(date);
  if (period === "anterior") {
    day.setUTCDate(day.getUTCDate() - 7);
    return weekRange(appDateKey(day));
  }
  let from = date,
    until = date;
  if (period === "mes") {
    from = date.slice(0, 7) + "-01";
    const end = dateBoundary(from);
    end.setUTCMonth(end.getUTCMonth() + 1);
    end.setUTCDate(end.getUTCDate() - 1);
    until = appDateKey(end);
  } else if (period === "personalizado") {
    from = selection.from ?? "";
    until = selection.until ?? "";
  } else if (period === "todo") {
    // The caller scopes records to the cycle or the authorized producer.
    from = "0001-01-01";
    until = "9999-12-30";
  }
  const start = dateBoundary(from),
    end = dateBoundary(until);
  if (start > end) throw new Error("La fecha Desde debe ser anterior o igual a Hasta.");
  end.setUTCDate(end.getUTCDate() + 1);
  return { key: from, lastDay: until, start: start.toISOString(), end: end.toISOString() };
}
