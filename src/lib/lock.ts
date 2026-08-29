import { createHash } from "node:crypto";

export function normalizeAccessCode(raw: string): string {
  return (raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

export function hashAccessCode(raw: string): string {
  return createHash("sha256").update(`santarosa-lock:${normalizeAccessCode(raw)}`).digest("hex");
}

export function accessCodeOk(given: string | null | undefined, storedHash: string | null | undefined): boolean {
  if (!storedHash) return false;
  const hash = hashAccessCode(given ?? "");
  return hash.length === storedHash.length && hash === storedHash;
}

export function namesMatchForDelete(typed: string, actual: string): boolean {
  return typed.trim().toLowerCase() === actual.trim().toLowerCase() && typed.trim().length > 0;
}
