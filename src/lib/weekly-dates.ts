import { appDateKey, parseLocalDateTime } from "./datetime";
export function weekRange(value = appDateKey(new Date())) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Elige una fecha válida.");
  const date = parseLocalDateTime(value + "T00:00");
  if (!Number.isFinite(date.getTime())) throw new Error("Elige una fecha válida.");
  const dow = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  const start = date.toISOString(),
    key = appDateKey(date);
  date.setUTCDate(date.getUTCDate() + 7);
  const end = date.toISOString();
  date.setUTCDate(date.getUTCDate() - 1);
  return { key, start, end, lastDay: appDateKey(date) };
}
