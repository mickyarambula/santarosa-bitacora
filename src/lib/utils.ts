import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export function num(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function bool(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1;
}

export function digitsPhone(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

export function formatPhone(raw: string | null | undefined): string {
  const d = digitsPhone(raw);
  if (d.length === 10) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  if (d.length === 12 && d.startsWith("52")) {
    return `${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
  }
  return raw?.trim() || "—";
}

export function whatsappShareHref(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function whatsappHref(phone: string | null | undefined, text?: string): string | null {
  let d = digitsPhone(phone);
  if (!d) return null;
  if (d.length === 10) d = `52${d}`;
  const base = `https://wa.me/${d}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

export function telHref(phone: string | null | undefined): string | null {
  const d = digitsPhone(phone);
  if (!d) return null;
  return `tel:+${d.length === 10 ? `52${d}` : d}`;
}

export function money(value: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export function compactMoney(value: number): string {
  const n = value || 0;
  if (Math.abs(n) >= 1_000_000) {
    const m = n / 1_000_000;
    return `$${m.toLocaleString("es-MX", { maximumFractionDigits: m >= 10 ? 1 : 2 })} M`;
  }
  if (Math.abs(n) >= 1_000) {
    return `$${(n / 1_000).toLocaleString("es-MX", { maximumFractionDigits: 0 })} mil`;
  }
  return money(n);
}

export function qty(value: number, digits = 1): string {
  return (value || 0).toLocaleString("es-MX", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

export function volumeOf(hectares: number, yieldTonHa: number): number {
  const v = (hectares || 0) * (yieldTonHa || 0);
  return Math.round(v * 100) / 100;
}

export function loanOf(hectares: number, perHa: number): number {
  return Math.round((hectares || 0) * (perHa || 0));
}

export function suggestedPerHa(crop: string): number {
  const perHa: Record<string, number> = {
    maiz_blanco: 35000,
    sorgo: 18000,
    frijol: 22000,
    garbanzo: 28000,
    maiz_amarillo: 32000,
  };
  return perHa[crop] ?? 25000;
}

export function suggestedFinancing(crop: string, hectares: number, scheme: string): number {
  if (scheme !== "financiamiento") return 0;
  return loanOf(hectares, suggestedPerHa(crop));
}

export function daysAgoLabel(iso: string | null | undefined): string {
  if (!iso) return "sin contacto";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "sin contacto";
  const d = Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
  if (d <= 0) return "hoy";
  if (d === 1) return "ayer";
  return `hace ${d} días`;
}

export function mailtoHref(email: string | null | undefined, subject?: string): string | null {
  const e = (email ?? "").trim();
  if (!e || !e.includes("@")) return null;
  const base = `mailto:${e}`;
  return subject ? `${base}?subject=${encodeURIComponent(subject)}` : base;
}

export function isoToDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
