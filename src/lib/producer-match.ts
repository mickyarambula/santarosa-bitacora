export function nameKey(raw: string): string {
  return (raw ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function phoneKey(raw: string | null | undefined): string {
  let d = (raw ?? "").replace(/\D/g, "");
  if (d.length >= 12 && d.startsWith("52")) d = d.slice(2);
  return d.length >= 10 ? d.slice(-10) : "";
}

export type DupRow = {
  id: string;
  name: string;
  ownerUserId: string;
  comisionistaName: string;
  zone: string;
  phone: string | null;
  groupId?: string | null;
};

export type DupHit = {
  id: string;
  name: string;
  agent: string;
  zone: string;
  via: "nombre" | "telefono";
  groupId?: string | null;
};

export function findDuplicateProducer(
  rows: DupRow[],
  candidate: {
    id?: string;
    name: string;
    ownerUserId: string;
    comisionistaName: string;
    zone: string;
    phone?: string | null;
    groupId?: string | null;
    newGroupName?: string | null;
  },
): DupHit | null {
  const key = nameKey(candidate.name);
  const phone = phoneKey(candidate.phone);
  const grouping = Boolean(candidate.groupId || (candidate.newGroupName ?? "").trim());
  if (!key) return null;

  for (const r of rows) {
    if (candidate.id && r.id === candidate.id) continue;
    if (nameKey(r.name) === key) {
      return { id: r.id, name: r.name, agent: r.comisionistaName, zone: r.zone, via: "nombre", groupId: r.groupId };
    }
  }
  if (!phone) return null;
  for (const r of rows) {
    if (candidate.id && r.id === candidate.id) continue;
    if (phoneKey(r.phone) !== phone) continue;
    if (grouping) {
      if (r.groupId && candidate.groupId && r.groupId !== candidate.groupId) {
        return { id: r.id, name: r.name, agent: r.comisionistaName, zone: r.zone, via: "telefono", groupId: r.groupId };
      }
      continue;
    }
    return { id: r.id, name: r.name, agent: r.comisionistaName, zone: r.zone, via: "telefono", groupId: r.groupId };
  }
  return null;
}

export function duplicateMessage(hit: DupHit, selfName: string): string {
  const mine = nameKey(hit.agent) === nameKey(selfName);
  if (hit.via === "telefono") {
    return `Ese WhatsApp ya está en ${hit.name} (${hit.agent}). Si es otro nombre del mismo productor, mételos a un grupo. Si es la misma persona, no lo dupliques.`;
  }
  if (mine) {
    return `${hit.name} ya lo capturaste. Búscalo en Productores, no lo des de alta otra vez.`;
  }
  return `${hit.name} ya está en ${hit.zone}, lo lleva ${hit.agent}. Si es el mismo, no lo dupliques.`;
}

export function groupDuplicates(rows: DupRow[]): DupRow[][] {
  const parent = new Map<string, string>();
  function find(id: string): string {
    let p = parent.get(id) ?? id;
    while (p !== (parent.get(p) ?? p)) p = parent.get(p) ?? p;
    parent.set(id, p);
    return p;
  }
  function union(a: string, b: string) {
    const pa = find(a);
    const pb = find(b);
    if (pa !== pb) parent.set(pa, pb);
  }

  for (const r of rows) parent.set(r.id, r.id);

  const byName = new Map<string, string[]>();
  for (const r of rows) {
    const nk = nameKey(r.name);
    if (nk) {
      const arr = byName.get(nk) ?? [];
      arr.push(r.id);
      byName.set(nk, arr);
    }
  }
  for (const ids of byName.values()) {
    for (let i = 1; i < ids.length; i++) union(ids[0]!, ids[i]!);
  }

  const buckets = new Map<string, DupRow[]>();
  for (const r of rows) {
    const root = find(r.id);
    const arr = buckets.get(root) ?? [];
    arr.push(r);
    buckets.set(root, arr);
  }
  return [...buckets.values()]
    .filter((g) => g.length > 1)
    .sort((a, b) => b.length - a.length || a[0]!.name.localeCompare(b[0]!.name, "es"));
}

export function groupReason(group: DupRow[]): "nombre" | "telefono" | "ambos" {
  const phones = group.map((r) => phoneKey(r.phone)).filter(Boolean);
  const phoneHit = phones.some((pk) => phones.filter((p) => p === pk).length > 1);
  const names = group.map((r) => nameKey(r.name));
  const nameHit = names.some((nk) => names.filter((n) => n === nk).length > 1);
  if (phoneHit && nameHit) return "ambos";
  if (phoneHit) return "telefono";
  return "nombre";
}

export type RankedDup = DupRow & {
  hectares: number;
  stage: string;
  updatedAt: string;
};

const STAGE_ORDER = [
  "prospecto",
  "visita",
  "interesado",
  "papeleria",
  "evaluacion",
  "habilitado",
  "acopio",
];

function stageScore(id: string): number {
  if (id === "cerrado") return -1;
  const i = STAGE_ORDER.indexOf(id);
  return i < 0 ? 0 : i;
}

export function pickWinner<T extends RankedDup>(group: T[]): T {
  if (!group.length) throw new Error("No hay fichas para comparar.");
  return [...group].sort((a, b) => {
    if (b.hectares !== a.hectares) return b.hectares - a.hectares;
    if (stageScore(b.stage) !== stageScore(a.stage)) return stageScore(b.stage) - stageScore(a.stage);
    const aPhone = phoneKey(a.phone) ? 1 : 0;
    const bPhone = phoneKey(b.phone) ? 1 : 0;
    if (bPhone !== aPhone) return bPhone - aPhone;
    return b.updatedAt.localeCompare(a.updatedAt);
  })[0]!;
}
