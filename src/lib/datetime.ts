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
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const parts =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/i.exec(
      normalized,
    );
  if (!parts) return new Date(NaN);
  const [, year, month, day, hour, minute, second, offset] = parts;
  const days = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  if (
    Number(month) < 1 ||
    Number(month) > 12 ||
    Number(day) < 1 ||
    Number(day) > days ||
    Number(hour) > 23 ||
    Number(minute) > 59 ||
    Number(second ?? 0) > 59
  )
    return new Date(NaN);
  return new Date(offset ? normalized : `${normalized}${APP_OFFSET}`);
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

/** datetime-local display anchored to Sinaloa, regardless of the device timezone. */
export function toAppDateTimeInput(value: string | Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (name: string) => parts.find((p) => p.type === name)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}
