/** Hora de operación: Los Mochis, Guasave y alrededores (Sinaloa). Sin horario de verano. */
export const APP_TZ = "America/Mazatlan";
const APP_OFFSET = "-07:00";

const TIME: Intl.DateTimeFormatOptions = {
  timeZone: APP_TZ,
  hour: "2-digit",
  minute: "2-digit",
};

/** datetime-local (YYYY-MM-DDTHH:mm) as wall clock in Sinaloa, not server UTC. */
export function parseLocalDateTime(value: string): Date {
  const raw = value.trim();
  if (!raw) return new Date(NaN);
  if (/Z$/i.test(raw) || /[+-]\d{2}:\d{2}$/.test(raw)) return new Date(raw);
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const withSeconds = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)
    ? `${normalized}:00`
    : normalized;
  return new Date(`${withSeconds}${APP_OFFSET}`);
}

export function appDateKey(value: Date | string): string {
  return new Date(value).toLocaleDateString("en-CA", { timeZone: APP_TZ });
}

export function formatAppTime(value: Date | string): string {
  return new Date(value).toLocaleTimeString("es-MX", TIME);
}

export function formatAppDay(value: Date | string): string {
  return new Date(value).toLocaleDateString("es-MX", {
    timeZone: APP_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function formatAppDateTime(
  value: Date | string,
  extra: Intl.DateTimeFormatOptions = {},
): string {
  return new Date(value).toLocaleString("es-MX", { timeZone: APP_TZ, ...extra });
}

export function isAppToday(value: Date | string, now = new Date()): boolean {
  return appDateKey(value) === appDateKey(now);
}

export function isAppThisWeek(value: Date | string, now = new Date()): boolean {
  const noon = new Date(`${appDateKey(now)}T12:00:00${APP_OFFSET}`);
  const dow = noon.getUTCDay();
  const mondayShift = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(noon);
  monday.setUTCDate(noon.getUTCDate() + mondayShift);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const key = appDateKey(value);
  return key >= appDateKey(monday) && key <= appDateKey(sunday);
}
