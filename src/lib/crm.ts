import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import {
  CYCLE,
  DOC_CATALOG,
  STAGES,
  cropLabel,
  docsForScheme,
  docLabel,
  docIsComplete,
  parseGroupRole,
  parseRejectionKind,
  parseRejectionReason,
  parseRelation,
  relationLabel,
  rejectionReasonLabel,
  schemeLabel,
  groupRoleLabel,
  channelLabel,
  outcomeLabel,
  stageMeta,
  type CropId,
  type DocStatus,
  type GroupRoleId,
  type RejectionKind,
  type RejectionReasonId,
  type RelationId,
  type SchemeId,
  type StageId,
} from "@/lib/catalog";
import { csvWithBom, toSpreadsheetXml } from "@/lib/excel";
import { accessCodeOk, hashAccessCode, namesMatchForDelete, normalizeAccessCode } from "@/lib/lock";
import { duplicateMessage, findDuplicateProducer, groupDuplicates, groupReason, phoneKey, pickWinner, type DupRow } from "@/lib/producer-match";
import { formatAppDateTime, formatAppTime, isAppThisWeek, isAppToday, parseLocalDateTime } from "@/lib/datetime";
import { followUpMessage, inviteToCloseMessage, inviteToVisitMessage, officeDigestMessage, paperworkMessage, visitConfirmMessage } from "@/lib/reminders";
import { bool, daysAgoLabel, digitsPhone, loanOf, newId, num, suggestedFinancing, suggestedPerHa, volumeOf, whatsappHref } from "@/lib/utils";
import type {
  AccountStatus,
  ActivityItem,
  AgentCartera,
  AgentCount,
  Announcement,
  AttentionItem,
  Dashboard,
  DocumentItem,
  GroupMember,
  OfficePerson,
  OfficePing,
  Producer,
  ProducerDetail,
  ProducerGroup,
  ProducerInput,
  Profile,
  ReminderItem,
  Role,
  StageCount,
  TouchItem,
  Visit,
} from "@/lib/types";

type Sql = Awaited<ReturnType<typeof getSql>>;

/** Special agent filter: gerente looking at only the producers they own. */
export const MINE_SCOPE = "__mine__";

function agentScope(profile: Profile, agentRaw?: string | null) {
  const raw = agentRaw?.trim() ?? "";
  if (raw === MINE_SCOPE) return { mine: true, agent: "" };
  return { mine: profile.role !== "gerente", agent: raw };
}

type ProducerRow = Record<string, unknown>;
type ProfileRow = {
  user_id: string;
  display_name: string;
  role: string;
  status?: string;
  phone: string | null;
  created_at: string | Date;
};

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return new Date().toISOString();
}

function mapProfile(row: ProfileRow): Profile {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    role: (row.role === "gerente" ? "gerente" : "comisionista") as Role,
    status: row.status === "bloqueado" ? "bloqueado" : "activo",
    phone: row.phone,
    createdAt: iso(row.created_at),
  };
}

function mapProducer(row: ProducerRow): Producer {
  const relation = parseRelation(row.relation, bool(row.is_new));
  return {
    id: String(row.id),
    ownerUserId: String(row.owner_user_id),
    comisionistaName: String(row.comisionista_name),
    name: String(row.name),
    businessUnit: (row.business_unit === "directo" ? "directo" : "parafinanciero") as Producer["businessUnit"],
    scheme: (["financiamiento", "cobertura_fira", "acopio"].includes(String(row.scheme))
      ? row.scheme
      : "financiamiento") as SchemeId,
    relation,
    isNew: relation === "nuevo",
    zone: String(row.zone ?? "Guasave"),
    locality: row.locality ? String(row.locality) : null,
    crop: String(row.crop ?? "maiz_blanco") as CropId,
    hectares: num(row.hectares),
    yieldTonHa: num(row.yield_ton_ha),
    volumeTon: num(row.volume_ton),
    financingMxn: num(row.financing_mxn),
    financingPerHa: num(row.financing_per_ha),
    phone: row.phone ? String(row.phone) : null,
    email: row.email ? String(row.email) : null,
    stage: String(row.stage ?? "prospecto") as StageId,
    blocker: row.blocker ? String(row.blocker) : null,
    notes: row.notes ? String(row.notes) : null,
    cycle: String(row.cycle ?? CYCLE),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    isExample: bool(row.is_example),
    lastTouchAt: row.last_touch_at ? iso(row.last_touch_at) : null,
    lastTouchChannel: row.last_touch_channel ? String(row.last_touch_channel) : null,
    groupId: row.group_id ? String(row.group_id) : null,
    groupRole: parseGroupRole(row.group_role),
    groupName: row.group_name ? String(row.group_name) : null,
    groupTitularName: row.group_titular_name ? String(row.group_titular_name) : null,
    rejectionKind: parseRejectionKind(row.rejection_kind),
    rejectionReason: parseRejectionReason(row.rejection_reason),
    rejectionNotes: row.rejection_notes ? String(row.rejection_notes) : null,
    hectaresRequested: num(row.hectares_requested) || num(row.hectares),
    rejectedAt: row.rejected_at ? iso(row.rejected_at) : null,
    rejectedBy: row.rejected_by ? String(row.rejected_by) : null,
  };
}

async function withGroupMeta(sql: Sql, producers: Producer[]): Promise<Producer[]> {
  if (!producers.length) return producers;
  const groups = await sql<{ id: string; name: string; titular_producer_id: string | null }>`
    select id, name, titular_producer_id from producer_groups where cycle = ${CYCLE}
  `;
  if (!groups.length) return producers;
  const byId = new Map(groups.map((g) => [String(g.id), g]));
  const titularIds = groups.map((g) => g.titular_producer_id).filter(Boolean) as string[];
  const titularNames = new Map<string, string>();
  if (titularIds.length) {
    const names = await sql<{ id: string; name: string }>`
      select id, name from producers where cycle = ${CYCLE}
    `;
    for (const n of names) titularNames.set(String(n.id), String(n.name));
  }
  return producers.map((p) => {
    if (!p.groupId) return p;
    const g = byId.get(p.groupId);
    if (!g) return p;
    const titularId = g.titular_producer_id ? String(g.titular_producer_id) : null;
    return {
      ...p,
      groupName: g.name,
      groupTitularName: titularId ? titularNames.get(titularId) ?? null : null,
    };
  });
}

function mapVisit(row: ProducerRow): Visit {
  return {
    id: String(row.id),
    producerId: String(row.producer_id),
    producerName: String(row.producer_name ?? ""),
    ownerUserId: String(row.owner_user_id),
    scheduledAt: iso(row.scheduled_at),
    place: row.place ? String(row.place) : null,
    purpose: row.purpose ? String(row.purpose) : null,
    status: String(row.status ?? "programada") as Visit["status"],
    notes: row.notes ? String(row.notes) : null,
    phone: row.phone ? String(row.phone) : null,
    zone: String(row.zone ?? ""),
    createdAt: iso(row.created_at),
  };
}

function mapDoc(row: ProducerRow, scheme: string): DocumentItem {
  const catalog = docsForScheme(scheme);
  const meta = catalog.find((d) => d.id === String(row.doc_type));
  return {
    id: String(row.id),
    producerId: String(row.producer_id),
    docType: String(row.doc_type),
    status: String(row.status ?? "pendiente") as DocStatus,
    notes: row.notes ? String(row.notes) : null,
    updatedAt: iso(row.updated_at),
    label: meta?.label ?? String(row.doc_type),
    required: meta?.required ?? false,
  };
}

function progressOf(docs: DocumentItem[]) {
  const required = docs.filter((d) => d.required);
  return {
    total: docs.length,
    required: required.length,
    done: docs.filter((d) => docIsComplete(d.status)).length,
    requiredDone: required.filter((d) => docIsComplete(d.status)).length,
  };
}

const DEMO_PRODUCER_NAMES = new Set([
  "Agrícola El Roble SPR de RL",
  "Ramón Payán López",
  "Productora Los Cañeros",
  "María Elena Osuna",
  "Ganadera y Agrícola Zazueta",
  "Jesús Antonio Beltrán",
  "Campo Nuevo Amanecer",
  "Socorro Inzunza",
  "Agrícola Bamoa",
  "Felipe Montoya",
  "Integradora del Valle",
  "Rosa Isela Cota",
]);

const DEMO_PHONES = new Set([
  "6871234567",
  "6689988776",
  "6874455122",
  "6981122334",
  "6683344556",
  "6877788990",
  "6872211009",
  "6735566778",
  "6876677889",
  "6682233445",
  "6731122334",
  "6873344556",
]);

function isDemoProducer(row: {
  name: string;
  phone: string | null;
  isExample?: boolean;
  notes: string | null;
}) {
  if (row.isExample) return true;
  if ((row.notes ?? "").toLowerCase().includes("ejemplo ciclo")) return true;
  return DEMO_PRODUCER_NAMES.has(row.name) && DEMO_PHONES.has(digitsPhone(row.phone));
}

async function wipeDemoProducers(sql: Sql): Promise<number> {
  const rows = await sql<{
    id: string;
    name: string;
    phone: string | null;
    is_example: unknown;
    notes: string | null;
  }>`
    select id, name, phone, is_example, notes from producers
  `;
  const ids = rows
    .filter((r) =>
      isDemoProducer({
        name: String(r.name),
        phone: r.phone ? String(r.phone) : null,
        isExample: bool(r.is_example),
        notes: r.notes ? String(r.notes) : null,
      }),
    )
    .map((r) => String(r.id));
  for (const id of ids) {
    await sql`delete from producers where id = ${id}`;
  }
  await sql`
    delete from producer_groups g
    where not exists (select 1 from producers p where p.group_id = g.id)
  `;
  return ids.length;
}

function isDemoEmail(email: string | null | undefined) {
  const e = (email ?? "").trim().toLowerCase();
  if (!e) return false;
  return (
    e.endsWith("@example.com") ||
    e.endsWith("@test.com") ||
    e.endsWith("@grok.invalid") ||
    e.includes("playwright") ||
    e.startsWith("qa-") ||
    e.startsWith("demo+")
  );
}

async function ensureProfile(
  sql: Sql,
  userId: string,
  displayName: string | null | undefined,
  accessCode?: string | null,
): Promise<Profile> {
  const existing = await sql<ProfileRow>`
    select user_id, display_name, role, status, phone, created_at
    from profiles where user_id = ${userId} limit 1
  `;
  const revoked = await sql<{ user_id: string }>`
    select user_id from revoked_users where user_id = ${userId} limit 1
  `;
  if (existing[0]) {
    const profile = mapProfile(existing[0]);
    if (revoked[0] && profile.status !== "bloqueado") {
      await sql`update profiles set status = 'bloqueado' where user_id = ${userId}`;
      return { ...profile, status: "bloqueado" };
    }
    return profile;
  }

  const countRows = await sql<{ n: number }>`select count(*)::int as n from profiles`;
  const isFirst = num(countRows[0]?.n) === 0;
  const role: Role = isFirst ? "gerente" : "comisionista";
  const name = (displayName ?? "").trim() || (role === "gerente" ? "Gerencia" : "Comisionista");
  let status: AccountStatus = "activo";
  if (revoked[0]) status = "bloqueado";
  else if (!isFirst) {
    const lock = await readLock(sql);
    if (lock.enabled && !accessCodeOk(accessCode, lock.codeHash)) status = "bloqueado";
  }

  await sql`
    insert into profiles (user_id, display_name, role, status)
    values (${userId}, ${name}, ${role}, ${status})
  `;
  const created = await sql<ProfileRow>`
    select user_id, display_name, role, status, phone, created_at
    from profiles where user_id = ${userId} limit 1
  `;
  return mapProfile(created[0]!);
}

async function readLock(sql: Sql): Promise<{ enabled: boolean; codeHash: string | null }> {
  const rows = await sql<{ enabled: boolean | string; code_hash: string | null }>`
    select enabled, code_hash from app_lock where id = 'default' limit 1
  `;
  if (!rows[0]) return { enabled: false, codeHash: null };
  return { enabled: bool(rows[0].enabled), codeHash: rows[0].code_hash };
}

async function getSessionName(userId: string): Promise<string | null> {
  try {
    const { getSessionUser } = await import("@/lib/auth/verify.server");
    const u = await getSessionUser();
    if (u && u.id === userId) {
      const email = u.email ?? "";
      const local = email.split("@")[0] ?? "";
      if (!local) return null;
      return local.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function requireProfile(sql: Sql, userId: string): Promise<Profile> {
  const name = await getSessionName(userId);
  const profile = await ensureProfile(sql, userId, name);
  if (profile.status === "bloqueado") {
    throw new Error("LOCKED");
  }
  return profile;
}

async function assertNoDuplicate(
  sql: Sql,
  profile: Profile,
  data: {
    id?: string;
    name: string;
    zone: string;
    phone?: string | null;
    comisionistaName: string;
    groupId?: string | null;
    newGroupName?: string | null;
  },
) {
  const rows = await sql<{
    id: string;
    name: string;
    owner_user_id: string;
    comisionista_name: string;
    zone: string;
    phone: string | null;
    group_id: string | null;
  }>`
    select id, name, owner_user_id, comisionista_name, zone, phone, group_id
    from producers
    where cycle = ${CYCLE}
  `;
  const list: DupRow[] = rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    ownerUserId: String(r.owner_user_id),
    comisionistaName: String(r.comisionista_name),
    zone: String(r.zone ?? ""),
    phone: r.phone ? String(r.phone) : null,
    groupId: r.group_id ? String(r.group_id) : null,
  }));
  const hit = findDuplicateProducer(list, {
    id: data.id,
    name: data.name,
    ownerUserId: profile.userId,
    comisionistaName: data.comisionistaName,
    zone: data.zone,
    phone: data.phone,
    groupId: data.groupId,
    newGroupName: data.newGroupName,
  });
  if (hit) throw new Error(duplicateMessage(hit, profile.displayName));
}

async function insertDocSet(sql: Sql, producerId: string, scheme: SchemeId) {
  const docs = DOC_CATALOG[scheme] ?? DOC_CATALOG.financiamiento;
  for (const doc of docs) {
    await sql`
      insert into documents (id, producer_id, doc_type, status)
      values (${newId("doc")}, ${producerId}, ${doc.id}, 'pendiente')
    `;
  }
}

async function loadGroup(sql: Sql, groupId: string | null | undefined): Promise<ProducerGroup | null> {
  if (!groupId) return null;
  const rows = await sql<{
    id: string;
    name: string;
    owner_user_id: string;
    comisionista_name: string;
    titular_producer_id: string | null;
    notes: string | null;
  }>`
    select id, name, owner_user_id, comisionista_name, titular_producer_id, notes
    from producer_groups where id = ${groupId} limit 1
  `;
  const g = rows[0];
  if (!g) return null;
  const memberRows = await sql<ProducerRow>`
    select * from producers where group_id = ${groupId} and cycle = ${CYCLE} order by name
  `;
  const producers = await withGroupMeta(sql, memberRows.map(mapProducer));
  const titularId = g.titular_producer_id ? String(g.titular_producer_id) : null;
  const titular = producers.find((p) => p.id === titularId) ?? producers.find((p) => p.groupRole === "titular");
  return {
    id: String(g.id),
    name: String(g.name),
    ownerUserId: String(g.owner_user_id),
    comisionistaName: String(g.comisionista_name),
    titularProducerId: titular?.id ?? titularId,
    titularName: titular?.name ?? null,
    notes: g.notes ? String(g.notes) : null,
    members: producers.length,
    hectares: producers.reduce((s, p) => s + p.hectares, 0),
    financing: producers.reduce((s, p) => s + p.financingMxn, 0),
    volume: producers.reduce((s, p) => s + p.volumeTon, 0),
    producers,
  };
}

async function attachToGroup(
  sql: Sql,
  profile: Profile,
  producerId: string,
  opts: {
    groupId?: string | null;
    newGroupName?: string | null;
    groupRole?: GroupRoleId | null;
    comisionistaName: string;
    phone?: string | null;
  },
) {
  const role = parseGroupRole(opts.groupRole) ?? "familiar";
  let groupId = opts.groupId?.trim() || "";
  const newName = (opts.newGroupName ?? "").trim();

  if (!groupId && !newName) {
    await sql`update producers set group_id = null, group_role = null where id = ${producerId}`;
    return;
  }

  if (!groupId && newName) {
    groupId = newId("grp");
    await sql`
      insert into producer_groups (id, name, owner_user_id, comisionista_name, cycle)
      values (${groupId}, ${newName}, ${profile.userId}, ${opts.comisionistaName}, ${CYCLE})
    `;
  }

  const group = await sql<{ id: string; owner_user_id: string; comisionista_name: string; titular_producer_id: string | null }>`
    select id, owner_user_id, comisionista_name, titular_producer_id
    from producer_groups where id = ${groupId} limit 1
  `;
  const g = group[0];
  if (!g) throw new Error("No encontramos ese grupo.");
  if (profile.role !== "gerente" && String(g.owner_user_id) !== profile.userId) {
    throw new Error("Ese grupo lo lleva otro comisionista.");
  }

  await sql`
    update producers
    set group_id = ${groupId}, group_role = ${role}, updated_at = now()
    where id = ${producerId}
  `;

  if (role === "titular" || !g.titular_producer_id) {
    const titularId = role === "titular" ? producerId : g.titular_producer_id || producerId;
    await sql`
      update producer_groups
      set titular_producer_id = ${titularId}, updated_at = now()
      where id = ${groupId}
    `;
    if (role === "titular") {
      await sql`
        update producers set group_role = 'familiar'
        where group_id = ${groupId} and id <> ${producerId} and group_role = 'titular'
      `;
    }
  }

  await linkPhoneSiblings(sql, producerId, groupId, opts.phone);
}

async function linkPhoneSiblings(
  sql: Sql,
  producerId: string,
  groupId: string,
  phoneRaw?: string | null,
) {
  const phone = phoneKey(phoneRaw);
  if (!phone) return;
  const others = await sql<{ id: string; name: string; group_id: string | null; group_role: string | null }>`
    select id, name, group_id, group_role from producers where cycle = ${CYCLE} and id <> ${producerId}
  `;
  for (const row of others) {
    const full = await sql<{ phone: string | null }>`select phone from producers where id = ${row.id} limit 1`;
    if (phoneKey(full[0]?.phone) !== phone) continue;
    if (row.group_id && String(row.group_id) !== groupId) continue;
    if (row.group_id === groupId) continue;
    await sql`
      update producers
      set group_id = ${groupId},
          group_role = ${row.group_role || "titular"},
          updated_at = now()
      where id = ${row.id}
    `;
  }
}

async function logActivity(
  sql: Sql,
  producerId: string,
  userId: string,
  kind: string,
  message: string,
) {
  await sql`
    insert into activity (id, producer_id, user_id, kind, message)
    values (${newId("act")}, ${producerId}, ${userId}, ${kind}, ${message})
  `;
}

async function listProducersRows(
  sql: Sql,
  profile: Profile,
  opts: { stage?: string; q?: string; mine?: boolean; crop?: string; zone?: string; agent?: string; relation?: string },
): Promise<Producer[]> {
  const { mine, agent } = agentScope(profile, opts.agent);
  const forceMine = opts.mine === true;
  const scopedMine = forceMine || mine;
  const relation = opts.relation?.trim() ?? "";
  const rows = await sql<ProducerRow>`
    select * from producers
    where cycle = ${CYCLE}
      and (${scopedMine} = false or owner_user_id = ${profile.userId})
      and (${agent} = '' or comisionista_name = ${agent})
      and (${opts.stage ?? ""} = '' or stage = ${opts.stage ?? ""})
      and (${opts.crop ?? ""} = '' or crop = ${opts.crop ?? ""})
      and (${opts.zone ?? ""} = '' or zone = ${opts.zone ?? ""})
      and (${relation} = '' or relation = ${relation})
      and (
        ${opts.q ?? ""} = ''
        or name ilike ${"%" + (opts.q ?? "") + "%"}
        or comisionista_name ilike ${"%" + (opts.q ?? "") + "%"}
        or zone ilike ${"%" + (opts.q ?? "") + "%"}
        or coalesce(phone, '') ilike ${"%" + (opts.q ?? "") + "%"}
      )
    order by updated_at desc
  `;
  return withGroupMeta(sql, rows.map(mapProducer));
}

async function assertCanEdit(sql: Sql, profile: Profile, producerId: string): Promise<Producer> {
  const rows = await sql<ProducerRow>`select * from producers where id = ${producerId} limit 1`;
  const producer = rows[0] ? mapProducer(rows[0]) : null;
  if (!producer) throw new Error("No encontramos a ese productor.");
  if (profile.role !== "gerente" && producer.ownerUserId !== profile.userId) {
    throw new Error("Este productor lo lleva otro comisionista.");
  }
  return (await withGroupMeta(sql, [producer]))[0]!;
}

export const bootstrap = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { displayName?: string | null; accessCode?: string | null } | undefined) => d ?? {})
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const fromSession = await getSessionName(context.userId);
    const name = (data.displayName ?? "").trim() || fromSession;
    const profile = await ensureProfile(sql, context.userId, name, data.accessCode);
    if (profile.status !== "bloqueado") {
      await autoResolveDuplicates(sql, profile.userId);
    }
    return { profile };
  });

export const getSignupGate = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await getSql();
  const lock = await readLock(sql);
  const count = await sql<{ n: number }>`select count(*)::int as n from profiles`;
  return { lockOn: lock.enabled, teamExists: num(count[0]?.n) > 0 };
});

export const getLock = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const me = await requireProfile(sql, context.userId);
    if (me.role !== "gerente") throw new Error("Solo gerencia puede ver el candado.");
    const lock = await readLock(sql);
    return { enabled: lock.enabled };
  });

export const setLock = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { enabled: boolean; code?: string | null }) => d)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await requireProfile(sql, context.userId);
    if (me.role !== "gerente") throw new Error("Solo gerencia puede cambiar el candado.");
    if (data.enabled) {
      const code = normalizeAccessCode(data.code ?? "");
      if (code.length < 4) throw new Error("La clave necesita al menos 4 caracteres.");
      const hash = hashAccessCode(code);
      await sql`
        insert into app_lock (id, enabled, code_hash, updated_at)
        values ('default', true, ${hash}, now())
        on conflict (id) do update set enabled = true, code_hash = ${hash}, updated_at = now()
      `;
    } else {
      await sql`
        insert into app_lock (id, enabled, updated_at)
        values ('default', false, now())
        on conflict (id) do update set enabled = false, updated_at = now()
      `;
    }
    return { ok: true as const, enabled: data.enabled };
  });

export const setMemberStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { userId: string; status: AccountStatus }) => d)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await requireProfile(sql, context.userId);
    if (me.role !== "gerente") throw new Error("Solo gerencia puede inhabilitar cuentas.");
    if (data.userId === me.userId) throw new Error("No puedes inhabilitarte a ti mismo.");
    const rows = await sql<ProfileRow>`
      select user_id, display_name, role, status, phone, created_at
      from profiles where user_id = ${data.userId} limit 1
    `;
    const target = rows[0] ? mapProfile(rows[0]) : null;
    if (!target) throw new Error("No encontramos esa cuenta.");
    if (data.status === "bloqueado" && target.role === "gerente") {
      const gerentes = await sql<{ n: number }>`
        select count(*)::int as n from profiles where role = 'gerente' and status = 'activo'
      `;
      if (num(gerentes[0]?.n) <= 1) throw new Error("Tiene que quedar al menos una gerencia activa.");
    }
    await sql`update profiles set status = ${data.status} where user_id = ${target.userId}`;
    if (data.status === "bloqueado") {
      await sql`
        insert into revoked_users (user_id, revoked_by, reason)
        values (${target.userId}, ${me.userId}, 'inhabilitado')
        on conflict (user_id) do nothing
      `;
      await sql`delete from "session" where "userId" = ${target.userId}`;
    } else {
      await sql`delete from revoked_users where user_id = ${target.userId}`;
    }
    return { ok: true as const };
  });

export const deleteMember = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { userId: string; confirmName: string; wipeCartera?: boolean }) => d)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await requireProfile(sql, context.userId);
    if (me.role !== "gerente") throw new Error("Solo gerencia puede eliminar cuentas.");
    if (data.userId === me.userId) throw new Error("No puedes borrar tu propia cuenta.");
    const rows = await sql<ProfileRow>`
      select user_id, display_name, role, status, phone, created_at
      from profiles where user_id = ${data.userId} limit 1
    `;
    const target = rows[0] ? mapProfile(rows[0]) : null;
    if (!target) throw new Error("No encontramos esa cuenta.");
    if (!namesMatchForDelete(data.confirmName, target.displayName)) {
      throw new Error("Escribe el nombre completo para confirmar que sí es esa cuenta.");
    }
    if (target.role === "gerente") {
      const gerentes = await sql<{ n: number }>`
        select count(*)::int as n from profiles where role = 'gerente' and status = 'activo'
      `;
      if (target.status === "activo" && num(gerentes[0]?.n) <= 1) {
        throw new Error("Tiene que quedar al menos una gerencia.");
      }
    }
    if (data.wipeCartera) {
      await sql`delete from producers where owner_user_id = ${target.userId}`;
      await sql`delete from visits where owner_user_id = ${target.userId}`;
    } else {
      await sql`update producers set owner_user_id = ${me.userId} where owner_user_id = ${target.userId}`;
      await sql`update visits set owner_user_id = ${me.userId} where owner_user_id = ${target.userId}`;
    }
    await sql`
      insert into revoked_users (user_id, revoked_by, reason)
      values (${target.userId}, ${me.userId}, 'eliminado')
      on conflict (user_id) do nothing
    `;
    await sql`delete from profiles where user_id = ${target.userId}`;
    await sql`delete from "session" where "userId" = ${target.userId}`;
    return { ok: true as const };
  });


export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { displayName: string; phone?: string | null }) => d)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const profile = await requireProfile(sql, context.userId);
    const displayName = data.displayName.trim();
    if (!displayName) throw new Error("Escribe cómo te dicen.");
    await sql`
      update profiles
      set display_name = ${displayName},
          phone = ${data.phone?.trim() || null}
      where user_id = ${profile.userId}
    `;
    return { ok: true as const };
  });

export const listTeam = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const me = await requireProfile(sql, context.userId);
    const profiles = await sql<ProfileRow>`
      select user_id, display_name, role, status, phone, created_at
      from profiles order by created_at asc
    `;
    const agents: (Profile & { producers: number; hectares: number; volume: number; financing: number })[] = [];
    for (const row of profiles) {
      const p = mapProfile(row);
      const stats = await sql<{ n: number; ha: string; vol: string; fin: string }>`
        select count(*)::int as n,
               coalesce(sum(hectares),0) as ha,
               coalesce(sum(volume_ton),0) as vol,
               coalesce(sum(financing_mxn),0) as fin
        from producers
        where cycle = ${CYCLE} and owner_user_id = ${p.userId}
      `;
      agents.push({
        ...p,
        producers: num(stats[0]?.n),
        hectares: num(stats[0]?.ha),
        volume: num(stats[0]?.vol),
        financing: num(stats[0]?.fin),
      });
    }
    return { me, agents };
  });

export const setMemberRole = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { userId: string; role: Role }) => d)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await requireProfile(sql, context.userId);
    if (me.role !== "gerente") throw new Error("Solo gerencia puede cambiar roles.");
    if (data.userId === me.userId && data.role !== "gerente") {
      throw new Error("No puedes quitarte el rol de gerencia a ti mismo. Pídele a otro de gerencia que te baje.");
    }
    if (data.role === "comisionista") {
      const current = await sql<{ role: string }>`
        select role from profiles where user_id = ${data.userId} limit 1
      `;
      if (current[0]?.role === "gerente") {
        const gerentes = await sql<{ n: number }>`
          select count(*)::int as n from profiles where role = 'gerente'
        `;
        if (num(gerentes[0]?.n) <= 1) {
          throw new Error("Tiene que quedar al menos una persona de gerencia.");
        }
      }
    }
    await sql`update profiles set role = ${data.role} where user_id = ${data.userId}`;
    return { ok: true as const };
  });

export const listProducers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(
    (d: { stage?: string; q?: string; mine?: boolean; crop?: string; zone?: string; agent?: string; relation?: string } | undefined) =>
      d ?? {},
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const profile = await requireProfile(sql, context.userId);
    const producers = await listProducersRows(sql, profile, data);
    return { profile, producers };
  });

export const getProducer = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: { id: string }) => d)
  .handler(async ({ context, data }): Promise<ProducerDetail & { profile: Profile }> => {
    const sql = await getSql();
    const profile = await requireProfile(sql, context.userId);
    const producer = await assertCanEdit(sql, profile, data.id);
    const docRows = await sql<ProducerRow>`
      select * from documents where producer_id = ${producer.id} order by doc_type
    `;
    let documents = docRows.map((r) => mapDoc(r, producer.scheme));
    if (documents.length === 0) {
      await insertDocSet(sql, producer.id, producer.scheme);
      const again = await sql<ProducerRow>`
        select * from documents where producer_id = ${producer.id} order by doc_type
      `;
      documents = again.map((r) => mapDoc(r, producer.scheme));
    }
    const visitRows = await sql<ProducerRow>`
      select v.*, p.name as producer_name, p.phone, p.zone
      from visits v
      join producers p on p.id = v.producer_id
      where v.producer_id = ${producer.id}
      order by v.scheduled_at desc
    `;
    const actRows = await sql<ProducerRow>`
      select * from activity where producer_id = ${producer.id} order by created_at desc limit 30
    `;
    const activity: ActivityItem[] = actRows.map((r) => ({
      id: String(r.id),
      producerId: String(r.producer_id),
      userId: String(r.user_id),
      kind: String(r.kind),
      message: String(r.message),
      createdAt: iso(r.created_at),
    }));
    const touchRows = await sql<ProducerRow>`
      select * from touches where producer_id = ${producer.id} order by happened_at desc limit 20
    `;
    const touches: TouchItem[] = touchRows.map((r) => ({
      id: String(r.id),
      producerId: String(r.producer_id),
      channel: String(r.channel),
      outcome: r.outcome ? String(r.outcome) : null,
      summary: r.summary ? String(r.summary) : null,
      happenedAt: iso(r.happened_at),
      createdAt: iso(r.created_at),
    }));
    const group = await loadGroup(sql, producer.groupId);
    const roster: GroupMember[] = [];
    if (group) {
      for (const m of group.producers) {
        const drows = await sql<ProducerRow>`select * from documents where producer_id = ${m.id}`;
        roster.push({
          producer: m,
          progress: progressOf(drows.map((r) => mapDoc(r, m.scheme))),
        });
      }
    }
    return {
      profile,
      producer,
      documents,
      progress: progressOf(documents),
      visits: visitRows.map(mapVisit),
      activity,
      touches,
      group,
      roster,
    };
  });

export const createProducer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: ProducerInput) => d)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const profile = await requireProfile(sql, context.userId);
    const name = data.name.trim();
    if (!name) throw new Error("Escribe el nombre del productor.");
    const hectares = Math.max(0, num(data.hectares));
    const yieldTonHa = Math.max(0, num(data.yieldTonHa));
    const volume = volumeOf(hectares, yieldTonHa);
    let perHa = Math.max(0, num(data.financingPerHa));
    if (data.scheme !== "financiamiento") perHa = 0;
    else if (!perHa) perHa = hectares ? Math.round(num(data.financingMxn) / hectares) : suggestedPerHa(data.crop);
    const financing = data.scheme === "financiamiento" ? loanOf(hectares, perHa) : 0;
    const id = newId("prd");
    const comisionistaName = (data.comisionistaName ?? profile.displayName).trim() || profile.displayName;
    const relation = parseRelation(data.relation, data.isNew);
    const isNew = relation === "nuevo";
    await assertNoDuplicate(sql, profile, {
      name,
      zone: data.zone,
      phone: data.phone,
      comisionistaName,
      groupId: data.groupId,
      newGroupName: data.newGroupName,
    });
    await sql`
      insert into producers (
        id, owner_user_id, comisionista_name, name, business_unit, scheme, is_new, relation,
        zone, locality, crop, hectares, yield_ton_ha, volume_ton, financing_mxn, financing_per_ha,
        phone, email, stage, blocker, notes, cycle, hectares_requested
      ) values (
        ${id}, ${profile.userId}, ${comisionistaName}, ${name}, ${data.businessUnit},
        ${data.scheme}, ${isNew}, ${relation}, ${data.zone}, ${data.locality?.trim() || null},
        ${data.crop}, ${hectares}, ${yieldTonHa}, ${volume}, ${financing}, ${perHa},
        ${data.phone?.trim() || null}, ${data.email?.trim() || null}, ${data.stage}, ${data.blocker?.trim() || null},
        ${data.notes?.trim() || null}, ${CYCLE}, ${hectares}
      )
    `;
    await insertDocSet(sql, id, data.scheme);
    await attachToGroup(sql, profile, id, {
      groupId: data.groupId,
      newGroupName: data.newGroupName,
      groupRole: data.groupRole,
      comisionistaName,
      phone: data.phone,
    });
    await logActivity(sql, id, profile.userId, "alta", `Se capturó a ${name}.`);
    return { id };
  });

export const updateProducer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: ProducerInput & { id: string }) => d)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const profile = await requireProfile(sql, context.userId);
    const prev = await assertCanEdit(sql, profile, data.id);
    const name = data.name.trim();
    if (!name) throw new Error("Escribe el nombre del productor.");
    const hectares = Math.max(0, num(data.hectares));
    const yieldTonHa = Math.max(0, num(data.yieldTonHa));
    const volume = volumeOf(hectares, yieldTonHa);
    let perHa = Math.max(0, num(data.financingPerHa));
    if (data.scheme !== "financiamiento") perHa = 0;
    else if (!perHa) perHa = hectares ? Math.round(num(data.financingMxn) / hectares) : suggestedPerHa(data.crop);
    const financing = data.scheme === "financiamiento" ? loanOf(hectares, perHa) : 0;
    const schemeChanged = prev.scheme !== data.scheme;
    const relation = parseRelation(data.relation, data.isNew);
    const isNew = relation === "nuevo";
    const comisionistaName = (data.comisionistaName ?? prev.comisionistaName).trim() || prev.comisionistaName;
    await assertNoDuplicate(sql, profile, {
      id: prev.id,
      name,
      zone: data.zone,
      phone: data.phone,
      comisionistaName,
      groupId: data.groupId,
      newGroupName: data.newGroupName,
    });
    await sql`
      update producers set
        comisionista_name = ${comisionistaName},
        name = ${name},
        business_unit = ${data.businessUnit},
        scheme = ${data.scheme},
        is_new = ${isNew},
        relation = ${relation},
        zone = ${data.zone},
        locality = ${data.locality?.trim() || null},
        crop = ${data.crop},
        hectares = ${hectares},
        yield_ton_ha = ${yieldTonHa},
        volume_ton = ${volume},
        financing_mxn = ${financing},
        financing_per_ha = ${perHa},
        phone = ${data.phone?.trim() || null},
        email = ${data.email?.trim() || null},
        stage = ${data.stage},
        blocker = ${data.blocker?.trim() || null},
        notes = ${data.notes?.trim() || null},
        updated_at = now()
      where id = ${prev.id}
    `;
    await attachToGroup(sql, profile, prev.id, {
      groupId: data.groupId,
      newGroupName: data.newGroupName,
      groupRole: data.groupRole ?? prev.groupRole,
      comisionistaName,
      phone: data.phone,
    });
    if (schemeChanged) {
      await sql`delete from documents where producer_id = ${prev.id}`;
      await insertDocSet(sql, prev.id, data.scheme);
      await logActivity(sql, prev.id, profile.userId, "esquema", `Cambió el esquema a ${data.scheme}.`);
    }
    if (prev.stage !== data.stage) {
      await logActivity(
        sql,
        prev.id,
        profile.userId,
        "etapa",
        `Pasó de ${stageMeta(prev.stage).label} a ${stageMeta(data.stage).label}.`,
      );
    }
    return { id: prev.id };
  });

export const setStage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: string; stage: StageId }) => d)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const profile = await requireProfile(sql, context.userId);
    const prev = await assertCanEdit(sql, profile, data.id);
    await sql`update producers set stage = ${data.stage}, updated_at = now() where id = ${prev.id}`;
    if (prev.stage !== data.stage) {
      await logActivity(
        sql,
        prev.id,
        profile.userId,
        "etapa",
        `Pasó de ${stageMeta(prev.stage).label} a ${stageMeta(data.stage).label}.`,
      );
    }
    return { ok: true as const };
  });

export const deleteProducer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const profile = await requireProfile(sql, context.userId);
    const prev = await assertCanEdit(sql, profile, data.id);
    const groupId = prev.groupId;
    await sql`delete from producers where id = ${prev.id}`;
    if (groupId) {
      const left = await sql<{ id: string; group_role: string | null }>`
        select id, group_role from producers where group_id = ${groupId}
      `;
      if (!left.length) {
        await sql`delete from producer_groups where id = ${groupId}`;
      } else if (prev.groupRole === "titular") {
        const next = left[0]!;
        await sql`update producer_groups set titular_producer_id = ${next.id}, updated_at = now() where id = ${groupId}`;
        await sql`update producers set group_role = 'titular' where id = ${next.id}`;
      }
    }
    return { ok: true as const };
  });

export const listDuplicateGroups = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const me = await requireProfile(sql, context.userId);
    if (me.role !== "gerente") return { groups: [] as { reason: string; producers: Producer[] }[] };
    const rows = await sql<ProducerRow>`select * from producers where cycle = ${CYCLE} order by name`;
    const producers = rows.map(mapProducer);
    const dups: DupRow[] = producers.map((p) => ({
      id: p.id,
      name: p.name,
      ownerUserId: p.ownerUserId,
      comisionistaName: p.comisionistaName,
      zone: p.zone,
      phone: p.phone,
    }));
    const groups = groupDuplicates(dups).map((g) => ({
      reason: groupReason(g),
      producers: g.map((r) => producers.find((p) => p.id === r.id)!).filter(Boolean),
    }));
    return { groups };
  });

function stageRank(id: string): number {
  if (id === "cerrado") return -1;
  const i = STAGES.findIndex((s) => s.id === id);
  return i < 0 ? 0 : i;
}

function docRank(status: string): number {
  if (status === "validado") return 4;
  if (status === "recibido") return 3;
  if (status === "no_aplica") return 2;
  if (status === "no_hizo") return 1;
  return 0;
}

async function mergeProducerInto(sql: Sql, keep: Producer, drop: Producer, userId: string) {
  const phone = keep.phone || drop.phone;
  const email = keep.email || drop.email;
  const locality = keep.locality || drop.locality;
  const blocker = keep.blocker || drop.blocker;
  const hectares = keep.hectares > 0 ? keep.hectares : drop.hectares;
  const yieldTonHa = keep.hectares > 0 ? keep.yieldTonHa : drop.yieldTonHa;
  const volume = keep.hectares > 0 ? keep.volumeTon : drop.volumeTon;
  const financing = keep.financingMxn > 0 ? keep.financingMxn : drop.financingMxn;
  const perHa = keep.financingPerHa > 0 ? keep.financingPerHa : drop.financingPerHa;
  const stage = stageRank(drop.stage) > stageRank(keep.stage) ? drop.stage : keep.stage;
  const noteBits = [keep.notes?.trim(), drop.notes?.trim()].filter(Boolean);
  const mergedNote = [
    ...noteBits,
    `Se juntó la ficha que llevaba ${drop.comisionistaName} (${drop.zone}).`,
  ].join("\n");
  const lastTouchAt =
    keep.lastTouchAt && drop.lastTouchAt
      ? keep.lastTouchAt > drop.lastTouchAt
        ? keep.lastTouchAt
        : drop.lastTouchAt
      : keep.lastTouchAt || drop.lastTouchAt;
  const lastTouchChannel =
    lastTouchAt === drop.lastTouchAt ? drop.lastTouchChannel : keep.lastTouchChannel;

  await sql`
    update producers set
      phone = ${phone},
      email = ${email},
      locality = ${locality},
      blocker = ${blocker},
      hectares = ${hectares},
      yield_ton_ha = ${yieldTonHa},
      volume_ton = ${volume},
      financing_mxn = ${financing},
      financing_per_ha = ${perHa},
      stage = ${stage},
      notes = ${mergedNote},
      last_touch_at = ${lastTouchAt},
      last_touch_channel = ${lastTouchChannel},
      updated_at = now()
    where id = ${keep.id}
  `;

  const keepDocs = await sql<{ id: string; doc_type: string; status: string }>`
    select id, doc_type, status from documents where producer_id = ${keep.id}
  `;
  const dropDocs = await sql<{ id: string; doc_type: string; status: string }>`
    select id, doc_type, status from documents where producer_id = ${drop.id}
  `;
  for (const dd of dropDocs) {
    const kd = keepDocs.find((d) => d.doc_type === dd.doc_type);
    if (!kd) {
      await sql`update documents set producer_id = ${keep.id} where id = ${dd.id}`;
    } else if (docRank(dd.status) > docRank(kd.status)) {
      await sql`update documents set status = ${dd.status}, updated_at = now() where id = ${kd.id}`;
    }
  }

  await sql`update visits set producer_id = ${keep.id} where producer_id = ${drop.id}`;
  await sql`update activity set producer_id = ${keep.id} where producer_id = ${drop.id}`;
  await sql`update touches set producer_id = ${keep.id} where producer_id = ${drop.id}`;
  await sql`update office_pings set producer_id = ${keep.id} where producer_id = ${drop.id}`;
  await logActivity(
    sql,
    keep.id,
    userId,
    "fusion",
    `Se juntó con la ficha de ${drop.name} que llevaba ${drop.comisionistaName}.`,
  );
  await sql`delete from producers where id = ${drop.id}`;
}

async function autoResolveDuplicates(sql: Sql, userId: string) {
  const rows = await sql<ProducerRow>`select * from producers where cycle = ${CYCLE}`;
  const producers = rows.map(mapProducer);
  const dups: DupRow[] = producers.map((p) => ({
    id: p.id,
    name: p.name,
    ownerUserId: p.ownerUserId,
    comisionistaName: p.comisionistaName,
    zone: p.zone,
    phone: p.phone,
  }));
  const groups = groupDuplicates(dups);
  for (const g of groups) {
    const ranked = g
      .map((r) => producers.find((p) => p.id === r.id))
      .filter((p): p is Producer => Boolean(p));
    if (ranked.length < 2) continue;
    const keep = pickWinner(
      ranked.map((p) => ({
        id: p.id,
        name: p.name,
        ownerUserId: p.ownerUserId,
        comisionistaName: p.comisionistaName,
        zone: p.zone,
        phone: p.phone,
        hectares: p.hectares,
        stage: p.stage,
        updatedAt: p.updatedAt,
      })),
    );
    const keepFullStart = ranked.find((p) => p.id === keep.id);
    if (!keepFullStart) continue;
    let keepFull = keepFullStart;
    for (const drop of ranked) {
      if (drop.id === keepFull.id) continue;
      const still = await sql<{ id: string }>`select id from producers where id = ${drop.id} limit 1`;
      if (!still[0]) continue;
      await mergeProducerInto(sql, keepFull, drop, userId);
      const refreshed = await sql<ProducerRow>`select * from producers where id = ${keepFull.id} limit 1`;
      if (refreshed[0]) keepFull = mapProducer(refreshed[0]);
    }
  }
}

export const resolveDuplicate = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { keepId: string; dropIds: string[] }) => d)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await requireProfile(sql, context.userId);
    if (me.role !== "gerente") throw new Error("Solo gerencia puede juntar o borrar duplicados.");
    const keepRows = await sql<ProducerRow>`select * from producers where id = ${data.keepId} limit 1`;
    const keep = keepRows[0] ? mapProducer(keepRows[0]) : null;
    if (!keep) throw new Error("No encontramos la ficha que quieres dejar.");
    const dropIds = [...new Set(data.dropIds.filter((id) => id && id !== keep.id))];
    if (!dropIds.length) throw new Error("Falta cuál ficha se quita.");
    for (const id of dropIds) {
      const rows = await sql<ProducerRow>`select * from producers where id = ${id} limit 1`;
      const drop = rows[0] ? mapProducer(rows[0]) : null;
      if (!drop) continue;
      await mergeProducerInto(sql, keep, drop, me.userId);
    }
    return { ok: true as const, keepId: keep.id };
  });

export const listGroups = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: { agent?: string } | undefined) => d ?? {})
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const profile = await requireProfile(sql, context.userId);
    const { mine, agent } = agentScope(profile, data.agent);
    const rows = await sql<{ id: string }>`
      select id from producer_groups
      where cycle = ${CYCLE}
        and (${mine} = false or owner_user_id = ${profile.userId})
        and (${agent} = '' or comisionista_name = ${agent})
      order by name
    `;
    const groups: ProducerGroup[] = [];
    for (const r of rows) {
      const g = await loadGroup(sql, String(r.id));
      if (g) groups.push(g);
    }

    const all = await listProducersRows(sql, profile, { agent: data.agent });
    const byPhone = new Map<string, Producer[]>();
    for (const p of all) {
      const pk = phoneKey(p.phone);
      if (!pk) continue;
      const arr = byPhone.get(pk) ?? [];
      arr.push(p);
      byPhone.set(pk, arr);
    }
    const shared = [...byPhone.values()]
      .filter((arr) => arr.length > 1)
      .filter((arr) => {
        const ids = new Set(arr.map((p) => p.groupId).filter(Boolean));
        return ids.size !== 1 || arr.some((p) => !p.groupId);
      })
      .map((producers) => ({
        phone: producers[0]!.phone,
        producers,
      }));

    return { profile, groups, shared };
  });

export const formGroupFromIds = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { producerIds: string[]; name: string; titularId?: string }) => d)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await requireProfile(sql, context.userId);
    const ids = [...new Set(data.producerIds.filter(Boolean))];
    if (ids.length < 2) throw new Error("Se necesitan al menos dos nombres para armar el grupo.");
    const name = data.name.trim();
    if (!name) throw new Error("Ponle nombre al grupo. Ej. Grupo Ramírez.");
    const members: Producer[] = [];
    for (const id of ids) {
      members.push(await assertCanEdit(sql, me, id));
    }
    const agents = new Set(members.map((p) => p.comisionistaName));
    if (agents.size > 1) {
      throw new Error("El grupo tiene que llevarlo un solo comisionista.");
    }
    const titular =
      members.find((p) => p.id === data.titularId) ??
      pickWinner(
        members.map((p) => ({
          id: p.id,
          name: p.name,
          ownerUserId: p.ownerUserId,
          comisionistaName: p.comisionistaName,
          zone: p.zone,
          phone: p.phone,
          hectares: p.hectares,
          stage: p.stage,
          updatedAt: p.updatedAt,
        })),
      );
    const titularFull = members.find((p) => p.id === titular.id)!;
    const gid = newId("grp");
    await sql`
      insert into producer_groups (id, name, owner_user_id, comisionista_name, titular_producer_id, cycle)
      values (${gid}, ${name}, ${titularFull.ownerUserId}, ${titularFull.comisionistaName}, ${titularFull.id}, ${CYCLE})
    `;
    for (const p of members) {
      await sql`
        update producers
        set group_id = ${gid},
            group_role = ${p.id === titularFull.id ? "titular" : p.groupRole || "familiar"},
            updated_at = now()
        where id = ${p.id}
      `;
    }
    return { id: gid };
  });

export const setDocumentStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: string; status: DocStatus }) => d)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const profile = await requireProfile(sql, context.userId);
    const rows = await sql<ProducerRow>`
      select d.*, p.owner_user_id, p.scheme, p.id as producer_id, p.name as producer_name
      from documents d
      join producers p on p.id = d.producer_id
      where d.id = ${data.id}
      limit 1
    `;
    const row = rows[0];
    if (!row) throw new Error("Documento no encontrado.");
    if (profile.role !== "gerente" && String(row.owner_user_id) !== profile.userId) {
      throw new Error("Este productor lo lleva otro comisionista.");
    }
    await sql`
      update documents set status = ${data.status}, updated_at = now() where id = ${data.id}
    `;
    await sql`update producers set updated_at = now() where id = ${String(row.producer_id)}`;
    await logActivity(
      sql,
      String(row.producer_id),
      profile.userId,
      "papel",
      `${docLabel(String(row.scheme), String(row.doc_type))}: ${data.status}.`,
    );
    return { ok: true as const };
  });

export const createVisit = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: {
    producerId: string;
    scheduledAt: string;
    place?: string | null;
    purpose?: string | null;
    notes?: string | null;
  }) => d)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const profile = await requireProfile(sql, context.userId);
    const producer = await assertCanEdit(sql, profile, data.producerId);
    const when = parseLocalDateTime(data.scheduledAt);
    if (Number.isNaN(when.getTime())) throw new Error("La fecha de la cita no es válida.");
    const id = newId("vis");
    await sql`
      insert into visits (id, producer_id, owner_user_id, scheduled_at, place, purpose, notes)
      values (
        ${id}, ${producer.id}, ${profile.userId}, ${when.toISOString()},
        ${data.place?.trim() || null}, ${data.purpose?.trim() || null}, ${data.notes?.trim() || null}
      )
    `;
    if (producer.stage === "prospecto") {
      await sql`update producers set stage = 'visita', updated_at = now() where id = ${producer.id}`;
    } else {
      await sql`update producers set updated_at = now() where id = ${producer.id}`;
    }
    await logActivity(
      sql,
      producer.id,
      profile.userId,
      "cita",
      `Cita: ${data.purpose?.trim() || "visita"} — ${formatAppDateTime(when, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}.`,
    );
    return { id };
  });

export const createTouch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (d: {
      producerId: string;
      channel: string;
      outcome?: string | null;
      summary?: string | null;
      happenedAt?: string | null;
    }) => d,
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const profile = await requireProfile(sql, context.userId);
    const producer = await assertCanEdit(sql, profile, data.producerId);
    const channel = data.channel.trim() || "nota";
    const when = data.happenedAt ? new Date(data.happenedAt) : new Date();
    const id = newId("tch");
    await sql`
      insert into touches (id, producer_id, owner_user_id, channel, outcome, summary, happened_at)
      values (
        ${id}, ${producer.id}, ${profile.userId}, ${channel},
        ${data.outcome?.trim() || null}, ${data.summary?.trim() || null}, ${when.toISOString()}
      )
    `;
    await sql`
      update producers
      set last_touch_at = ${when.toISOString()},
          last_touch_channel = ${channel},
          updated_at = now()
      where id = ${producer.id}
    `;
    const bits = [channelLabel(channel), outcomeLabel(data.outcome), data.summary?.trim()].filter(Boolean);
    await logActivity(sql, producer.id, profile.userId, "contacto", bits.join(" · "));
    return { id };
  });

export const setVisitStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: string; status: Visit["status"]; notes?: string | null }) => d)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const profile = await requireProfile(sql, context.userId);
    const rows = await sql<ProducerRow>`
      select v.*, p.owner_user_id, p.id as producer_id, p.name as producer_name
      from visits v join producers p on p.id = v.producer_id
      where v.id = ${data.id} limit 1
    `;
    const row = rows[0];
    if (!row) throw new Error("Cita no encontrada.");
    if (profile.role !== "gerente" && String(row.owner_user_id) !== profile.userId) {
      throw new Error("Esta cita es de otro comisionista.");
    }
    await sql`
      update visits
      set status = ${data.status}, notes = coalesce(${data.notes?.trim() || null}, notes)
      where id = ${data.id}
    `;
    return { ok: true as const };
  });

export const listVisits = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: { range?: "hoy" | "semana" | "todas"; agent?: string } | undefined) => d ?? {})
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const profile = await requireProfile(sql, context.userId);
    const { mine, agent } = agentScope(profile, data.agent);
    const range = data.range ?? "semana";
    const rows = await sql<ProducerRow>`
      select v.*, p.name as producer_name, p.phone, p.zone
      from visits v
      join producers p on p.id = v.producer_id
      where (${mine} = false or v.owner_user_id = ${profile.userId})
        and (${agent} = '' or p.comisionista_name = ${agent})
      order by v.scheduled_at asc
    `;
    let visits = rows.map(mapVisit);
    if (range === "hoy") visits = visits.filter((v) => isAppToday(v.scheduledAt));
    if (range === "semana") visits = visits.filter((v) => isAppThisWeek(v.scheduledAt));
    return { profile, visits };
  });

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: { agent?: string } | undefined) => d ?? {})
  .handler(async ({ context, data }): Promise<Dashboard> => {
    const sql = await getSql();
    const profile = await requireProfile(sql, context.userId);
    await wipeDemoProducers(sql);
    const { mine, agent } = agentScope(profile, data.agent);
    const list = await listProducersRows(sql, profile, { agent: data.agent });
    const live = list.filter((p) => p.rejectionKind !== "total");

    const kpis = {
      producers: live.length,
      hectares: live.reduce((s, p) => s + p.hectares, 0),
      volume: live.reduce((s, p) => s + p.volumeTon, 0),
      financing: live.reduce((s, p) => s + p.financingMxn, 0),
      pendingDocs: 0,
      visitsToday: 0,
    };

    const stages: StageCount[] = STAGES.map((st) => {
      const items = list.filter((p) => p.stage === st.id);
      return {
        stage: st.id,
        count: items.length,
        hectares: items.reduce((s, p) => s + p.hectares, 0),
        volume: items.reduce((s, p) => s + p.volumeTon, 0),
        financing: items.reduce((s, p) => s + p.financingMxn, 0),
      };
    });

    const agentMap = new Map<string, AgentCount>();
    for (const p of live) {
      const cur = agentMap.get(p.comisionistaName) ?? {
        name: p.comisionistaName,
        count: 0,
        hectares: 0,
        volume: 0,
        financing: 0,
      };
      cur.count += 1;
      cur.hectares += p.hectares;
      cur.volume += p.volumeTon;
      cur.financing += p.financingMxn;
      agentMap.set(p.comisionistaName, cur);
    }
    const agents = [...agentMap.values()].sort((a, b) => b.volume - a.volume);

    const cropMap = new Map<string, { crop: string; hectares: number; volume: number }>();
    for (const p of list) {
      const label = cropLabel(p.crop);
      const cur = cropMap.get(label) ?? { crop: label, hectares: 0, volume: 0 };
      cur.hectares += p.hectares;
      cur.volume += p.volumeTon;
      cropMap.set(label, cur);
    }

    const pending = await sql<{ n: number }>`
      select count(*)::int as n
      from documents d
      join producers p on p.id = d.producer_id
      where d.status = 'pendiente'
        and p.cycle = ${CYCLE}
        and (${mine} = false or p.owner_user_id = ${profile.userId})
        and (${agent} = '' or p.comisionista_name = ${agent})
    `;
    kpis.pendingDocs = num(pending[0]?.n);

    const todayRows = await sql<ProducerRow>`
      select v.*, p.name as producer_name, p.phone, p.zone
      from visits v
      join producers p on p.id = v.producer_id
      where v.status = 'programada'
        and v.scheduled_at >= now() - interval '1 day'
        and v.scheduled_at < now() + interval '2 days'
        and (${mine} = false or v.owner_user_id = ${profile.userId})
        and (${agent} = '' or p.comisionista_name = ${agent})
      order by v.scheduled_at asc
    `;
    const todayVisits = todayRows.map(mapVisit).filter((v) => isAppToday(v.scheduledAt));
    kpis.visitsToday = todayVisits.length;

    const upcomingRows = await sql<ProducerRow>`
      select v.*, p.name as producer_name, p.phone, p.zone
      from visits v
      join producers p on p.id = v.producer_id
      where v.status = 'programada'
        and v.scheduled_at > now()
        and (${mine} = false or v.owner_user_id = ${profile.userId})
        and (${agent} = '' or p.comisionista_name = ${agent})
      order by v.scheduled_at asc
      limit 24
    `;

    const attention: AttentionItem[] = [];
    for (const v of todayVisits) {
      attention.push({
        id: `cita-${v.id}`,
        kind: "cita_hoy",
        title: v.producerName,
        detail: v.purpose ? `${v.purpose}${v.place ? ` · ${v.place}` : ""}` : "Visita de hoy",
        producerId: v.producerId,
      });
    }

    const paperRows = await sql<ProducerRow>`
      select p.id, p.name, p.blocker,
             count(*) filter (where d.status = 'pendiente')::int as faltan
      from producers p
      join documents d on d.producer_id = p.id
      where p.cycle = ${CYCLE}
        and p.stage in ('interesado', 'papeleria', 'evaluacion')
        and (${mine} = false or p.owner_user_id = ${profile.userId})
        and (${agent} = '' or p.comisionista_name = ${agent})
      group by p.id, p.name, p.blocker
      having count(*) filter (where d.status = 'pendiente') > 0
      order by faltan desc
      limit 6
    `;
    for (const r of paperRows) {
      attention.push({
        id: `paper-${r.id}`,
        kind: "papeleria",
        title: String(r.name),
        detail: r.blocker ? String(r.blocker) : `Faltan ${num(r.faltan)} documentos`,
        producerId: String(r.id),
      });
    }

    const stuck = list.filter((p) => {
      if (!["prospecto", "visita"].includes(p.stage)) return false;
      const age = Date.now() - new Date(p.updatedAt).getTime();
      return age > 1000 * 60 * 60 * 24 * 3;
    });
    for (const p of stuck.slice(0, 4)) {
      attention.push({
        id: `stuck-${p.id}`,
        kind: "estancado",
        title: p.name,
        detail: `Lleva más de 3 días en ${stageMeta(p.stage).label.toLowerCase()}`,
        producerId: p.id,
      });
    }

    for (const p of list) {
      if (!["prospecto", "visita", "interesado"].includes(p.stage)) continue;
      const last = p.lastTouchAt ? new Date(p.lastTouchAt).getTime() : 0;
      const days = last ? (Date.now() - last) / (1000 * 60 * 60 * 24) : 99;
      if (days < 5) continue;
      attention.push({
        id: `contacto-${p.id}`,
        kind: "sin_contacto",
        title: p.name,
        detail: last
          ? `Sin hablarle ${daysAgoLabel(p.lastTouchAt)} (${channelLabel(p.lastTouchChannel ?? "")})`
          : "Aún no hay llamada, WhatsApp ni visita registrada",
        producerId: p.id,
      });
    }

    const recent = [...list]
      .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
      .slice(0, 6);

    const seedNames = new Set(SEED.map((s) => s.name));
    const exampleCount = list.filter((p) => p.isExample || seedNames.has(p.name)).length;

    return {
      profile,
      kpis,
      stages,
      agents,
      crops: [...cropMap.values()].sort((a, b) => b.hectares - a.hectares),
      todayVisits,
      upcomingVisits: upcomingRows
        .map(mapVisit)
        .filter((v) => !isAppToday(v.scheduledAt))
        .slice(0, 8),
      attention: attention.slice(0, 10),
      recent,
      exampleCount,
    };
  });

function producerExportCells(p: Producer): (string | number)[] {
  return [
    p.comisionistaName,
    p.name,
    p.businessUnit === "directo" ? "Directo" : "Parafinanciero",
    schemeLabel(p.scheme),
    relationLabel(p.relation),
    p.groupName ?? "",
    p.groupRole ? groupRoleLabel(p.groupRole) : "",
    p.groupTitularName ?? "",
    p.rejectionKind === "total" ? "Rechazo total" : p.rejectionKind === "parcial" ? "Rechazo parcial" : "",
    p.rejectionReason ? rejectionReasonLabel(p.rejectionReason) : "",
    p.rejectionNotes ?? "",
    p.hectaresRequested || "",
    p.locality ? `${p.zone} / ${p.locality}` : p.zone,
    cropLabel(p.crop),
    p.hectares,
    p.yieldTonHa,
    p.volumeTon,
    p.financingPerHa || "",
    p.financingMxn,
    p.phone ?? "",
    p.email ?? "",
    stageMeta(p.stage).label,
    p.blocker ?? "",
    p.notes ?? "",
  ];
}

const EXPORT_HEADERS = [
  "Comisionista",
  "Productor / razón social",
  "Unidad de negocio",
  "Esquema / servicio",
  "Relación",
  "Grupo",
  "Rol en grupo",
  "Productor real",
  "Rechazo",
  "Motivo rechazo",
  "Notas rechazo",
  "Ha pedidas",
  "Zona / Municipio",
  "Cultivo",
  "Hectáreas",
  "Rend. est. (ton/ha)",
  "Volumen est. (ton)",
  "$ / ha",
  "Financiamiento est. ($)",
  "Teléfono",
  "Correo",
  "Etapa actual",
  "¿Qué falta para habilitarlo / entrar?",
  "Notas / próximo paso",
];

export const exportCsv = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: { agent?: string } | undefined) => d ?? {})
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const profile = await requireProfile(sql, context.userId);
    const producers = await listProducersRows(sql, profile, { agent: data.agent });
    const lines = [
      EXPORT_HEADERS.map((h) => `"${h.replaceAll('"', '""')}"`).join(","),
      ...producers.map((p) =>
        producerExportCells(p)
          .map((c) => `"${String(c).replaceAll('"', '""')}"`)
          .join(","),
      ),
    ];
    const suffix = data.agent?.trim() ? `_${data.agent.trim().replaceAll(" ", "_")}` : "";
    return { filename: `SantaRosa_ciclo_${CYCLE}${suffix}.csv`, csv: csvWithBom(lines) };
  });

export const exportExcel = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: { agent?: string } | undefined) => d ?? {})
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const profile = await requireProfile(sql, context.userId);
    const producers = await listProducersRows(sql, profile, { agent: data.agent });
    const byAgent = new Map<string, Producer[]>();
    for (const p of producers) {
      const arr = byAgent.get(p.comisionistaName) ?? [];
      arr.push(p);
      byAgent.set(p.comisionistaName, arr);
    }
    const summaryRows = [...byAgent.entries()]
      .map(([name, items]) => [
        name,
        items.length,
        items.reduce((s, p) => s + p.hectares, 0),
        items.reduce((s, p) => s + p.volumeTon, 0),
        items.reduce((s, p) => s + p.financingMxn, 0),
      ])
      .sort((a, b) => Number(b[3]) - Number(a[3]));

    const xml = toSpreadsheetXml([
      {
        name: `Captura ${CYCLE}`,
        headers: EXPORT_HEADERS,
        rows: producers.map(producerExportCells),
      },
      {
        name: "Por comisionista",
        headers: ["Comisionista", "Productores", "Hectáreas", "Volumen (t)", "Financiamiento ($)"],
        rows: summaryRows,
      },
    ]);
    const suffix = data.agent?.trim() ? `_${data.agent.trim().replaceAll(" ", "_")}` : "";
    return { filename: `SantaRosa_ciclo_${CYCLE}${suffix}.xls`, xml };
  });

export const listAgentNames = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const profile = await requireProfile(sql, context.userId);
    if (profile.role !== "gerente") return { names: [] as string[] };
    const rows = await sql<{ name: string }>`
      select distinct comisionista_name as name
      from producers
      where cycle = ${CYCLE}
      order by comisionista_name
    `;
    return { names: rows.map((r) => r.name) };
  });

export const getCartera = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const profile = await requireProfile(sql, context.userId);
    await wipeDemoProducers(sql);
    const producers = await listProducersRows(sql, profile, {});
    const map = new Map<string, Producer[]>();
    for (const p of producers) {
      const arr = map.get(p.comisionistaName) ?? [];
      arr.push(p);
      map.set(p.comisionistaName, arr);
    }
    const agents: AgentCartera[] = [...map.entries()]
      .map(([name, items]) => ({
        name,
        count: items.length,
        hectares: items.reduce((s, p) => s + p.hectares, 0),
        volume: items.reduce((s, p) => s + p.volumeTon, 0),
        financing: items.reduce((s, p) => s + p.financingMxn, 0),
        stages: STAGES.map((st) => ({
          stage: st.id,
          count: items.filter((p) => p.stage === st.id).length,
        })).filter((s) => s.count > 0),
        items: items.sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)),
      }))
      .sort((a, b) => b.volume - a.volume);
    return { profile, agents };
  });

export const listReminders = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: { agent?: string } | undefined) => d ?? {})
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const profile = await requireProfile(sql, context.userId);
    const { mine, agent } = agentScope(profile, data.agent);
    const items: ReminderItem[] = [];

    const visitRows = await sql<ProducerRow>`
      select v.*, p.name as producer_name, p.phone, p.zone, p.comisionista_name
      from visits v
      join producers p on p.id = v.producer_id
      where v.status = 'programada'
        and v.scheduled_at >= now() - interval '2 hours'
        and v.scheduled_at < now() + interval '2 days'
        and (${mine} = false or v.owner_user_id = ${profile.userId})
        and (${agent} = '' or p.comisionista_name = ${agent})
      order by v.scheduled_at asc
    `;
    for (const r of visitRows) {
      const when = new Date(iso(r.scheduled_at));
      const producerName = String(r.producer_name ?? "");
      const agentName = String(r.comisionista_name ?? "");
      items.push({
        id: `cita-${r.id}`,
        kind: "cita",
        producerId: String(r.producer_id),
        producerName,
        phone: r.phone ? String(r.phone) : null,
        comisionistaName: agentName,
        title: producerName,
        detail: `${formatAppDateTime(when, { weekday: "short", hour: "2-digit", minute: "2-digit" })}${r.purpose ? ` · ${r.purpose}` : ""}`,
        message: visitConfirmMessage({
          producerName,
          when,
          purpose: r.purpose ? String(r.purpose) : null,
          place: r.place ? String(r.place) : null,
        }),
      });
    }

    const paperRows = await sql<ProducerRow>`
      select p.id, p.name, p.phone, p.comisionista_name, p.scheme, d.doc_type
      from producers p
      join documents d on d.producer_id = p.id
      where p.cycle = ${CYCLE}
        and d.status = 'pendiente'
        and p.stage in ('interesado', 'papeleria', 'evaluacion')
        and (${mine} = false or p.owner_user_id = ${profile.userId})
        and (${agent} = '' or p.comisionista_name = ${agent})
      order by p.name
    `;
    const paperMap = new Map<
      string,
      { id: string; name: string; phone: string | null; agentName: string; scheme: string; labels: string[] }
    >();
    for (const r of paperRows) {
      const id = String(r.id);
      const cur = paperMap.get(id) ?? {
        id,
        name: String(r.name),
        phone: r.phone ? String(r.phone) : null,
        agentName: String(r.comisionista_name ?? ""),
        scheme: String(r.scheme),
        labels: [],
      };
      cur.labels.push(docLabel(cur.scheme, String(r.doc_type)));
      paperMap.set(id, cur);
    }
    for (const row of [...paperMap.values()].sort((a, b) => b.labels.length - a.labels.length).slice(0, 20)) {
      items.push({
        id: `paper-${row.id}`,
        kind: "papeleria",
        producerId: row.id,
        producerName: row.name,
        phone: row.phone,
        comisionistaName: row.agentName,
        title: row.name,
        detail: `Faltan ${row.labels.length}: ${row.labels.slice(0, 3).join(", ")}`,
        message: paperworkMessage({ producerName: row.name, agentName: row.agentName, missing: row.labels }),
      });
    }

    const list = await listProducersRows(sql, profile, { agent: agent || undefined });
    const stuck = list.filter((p) => {
      if (!["prospecto", "visita"].includes(p.stage)) return false;
      return Date.now() - new Date(p.updatedAt).getTime() > 1000 * 60 * 60 * 24 * 3;
    });
    for (const p of stuck.slice(0, 8)) {
      items.push({
        id: `stuck-${p.id}`,
        kind: "estancado",
        producerId: p.id,
        producerName: p.name,
        phone: p.phone,
        comisionistaName: p.comisionistaName,
        title: p.name,
        detail: `Más de 3 días en ${stageMeta(p.stage).label.toLowerCase()}`,
        message: followUpMessage({
          producerName: p.name,
          agentName: p.comisionistaName,
          stageLabel: stageMeta(p.stage).label,
        }),
      });
    }

    return { profile, items };
  });

type SeedSpec = {
  name: string;
  agent: string;
  unit: Producer["businessUnit"];
  scheme: SchemeId;
  isNew: boolean;
  relation?: RelationId;
  zone: string;
  locality?: string;
  crop: CropId;
  ha: number;
  yield: number;
  phone: string;
  stage: StageId;
  blocker?: string;
  notes?: string;
  docs?: Partial<Record<string, DocStatus>>;
  visits?: { offsetHours: number; purpose: string; place: string; status?: Visit["status"] }[];
};

const SEED: SeedSpec[] = [
  {
    name: "Agrícola El Roble SPR de RL",
    agent: "Luis Cota",
    unit: "parafinanciero",
    scheme: "financiamiento",
    isNew: false,
    zone: "Guasave",
    locality: "Bamoa",
    crop: "maiz_blanco",
    ha: 250,
    yield: 12,
    phone: "6871234567",
    stage: "evaluacion",
    blocker: "Falta validar garantía",
    notes: "Visitarlo el jueves. Productor fuerte, ya ha entregado tres ciclos.",
    docs: {
      ine: "validado",
      curp: "validado",
      rfc: "recibido",
      domicilio: "recibido",
      predio: "recibido",
      predial: "pendiente",
      cuenta: "recibido",
      croquis: "recibido",
      solicitud: "recibido",
      garantia: "pendiente",
    },
    visits: [{ offsetHours: 28, purpose: "Revisar garantía", place: "Oficina Guasave" }],
  },
  {
    name: "Ramón Payán López",
    agent: "María Beltrán",
    unit: "directo",
    scheme: "cobertura_fira",
    isNew: true,
    zone: "Ahome",
    locality: "Los Mochis",
    crop: "maiz_blanco",
    ha: 180,
    yield: 13,
    phone: "6689988776",
    stage: "prospecto",
    blocker: "Reunir docs para inscribir cobertura",
    notes: "No requiere habilitación. Quiere entrar por cobertura FIRA.",
    visits: [{ offsetHours: 4, purpose: "Primera visita", place: "Campo — ejido 27 de Septiembre" }],
  },
  {
    name: "Productora Los Cañeros",
    agent: "Luis Cota",
    unit: "parafinanciero",
    scheme: "financiamiento",
    isNew: false,
    relation: "recuperacion",
    zone: "Guasave",
    locality: "León Fonseca",
    crop: "sorgo",
    ha: 120,
    yield: 9.5,
    phone: "6874455122",
    stage: "papeleria",
    blocker: "Falta estado de cuenta y predial",
    notes: "Ya sembró. Urge papelería para liberar diésel. Se fue el ciclo pasado; lo estamos recuperando.",
    docs: { ine: "validado", curp: "recibido", rfc: "recibido", domicilio: "recibido", predio: "recibido" },
    visits: [{ offsetHours: 26, purpose: "Recoger papelería", place: "Casa del productor" }],
  },
  {
    name: "María Elena Osuna",
    agent: "María Beltrán",
    unit: "directo",
    scheme: "financiamiento",
    isNew: true,
    zone: "El Fuerte",
    crop: "frijol",
    ha: 40,
    yield: 2.1,
    phone: "6981122334",
    stage: "visita",
    notes: "Primera vez con Santa Rosa. Muy puntual.",
    visits: [{ offsetHours: 2, purpose: "Convencer / cerrar trato", place: "Campo El Fuerte" }],
  },
  {
    name: "Ganadera y Agrícola Zazueta",
    agent: "Jesús Zazueta",
    unit: "parafinanciero",
    scheme: "financiamiento",
    isNew: false,
    zone: "Ahome",
    locality: "El Carrizo",
    crop: "maiz_blanco",
    ha: 310,
    yield: 12.5,
    phone: "6683344556",
    stage: "habilitado",
    notes: "Insumos ya programados. Buen historial de entrega.",
    docs: {
      ine: "validado",
      curp: "validado",
      rfc: "validado",
      domicilio: "validado",
      predio: "validado",
      predial: "validado",
      cuenta: "validado",
      croquis: "recibido",
      solicitud: "validado",
      garantia: "validado",
      sat: "recibido",
    },
  },
  {
    name: "Jesús Antonio Beltrán",
    agent: "Jesús Zazueta",
    unit: "directo",
    scheme: "acopio",
    isNew: false,
    zone: "Sinaloa",
    crop: "garbanzo",
    ha: 55,
    yield: 2.4,
    phone: "6877788990",
    stage: "acopio",
    notes: "Va a entregar en bodega Los Mochis a partir de abril.",
    docs: { ine: "validado", telefono: "validado", predio: "recibido" },
  },
  {
    name: "Campo Nuevo Amanecer",
    agent: "Luis Cota",
    unit: "parafinanciero",
    scheme: "financiamiento",
    isNew: true,
    zone: "Guasave",
    crop: "maiz_blanco",
    ha: 90,
    yield: 11.5,
    phone: "6872211009",
    stage: "papeleria",
    blocker: "Falta título de la parcela 4",
    notes: "Tiene 3 predios, uno está a nombre del papá.",
    docs: { ine: "recibido", curp: "recibido", rfc: "pendiente", predio: "pendiente" },
    visits: [{ offsetHours: 50, purpose: "Recoger papelería", place: "Oficina Santa Rosa" }],
  },
  {
    name: "Socorro Inzunza",
    agent: "María Beltrán",
    unit: "directo",
    scheme: "cobertura_fira",
    isNew: true,
    zone: "Angostura",
    crop: "sorgo",
    ha: 70,
    yield: 8.5,
    phone: "6735566778",
    stage: "interesado",
    blocker: "Reunir docs para inscribir cobertura",
    notes: "Quiere cobertura, no financiamiento.",
    visits: [{ offsetHours: 74, purpose: "Recoger papelería", place: "Angostura centro" }],
  },
  {
    name: "Agrícola Bamoa",
    agent: "Luis Cota",
    unit: "parafinanciero",
    scheme: "financiamiento",
    isNew: false,
    zone: "Guasave",
    locality: "Bamoa",
    crop: "maiz_blanco",
    ha: 200,
    yield: 12,
    phone: "6876677889",
    stage: "evaluacion",
    blocker: "Mesa de crédito el viernes",
    notes: "Mismo grupo de El Roble. Coordinar visita conjunta.",
    docs: { ine: "validado", curp: "validado", rfc: "validado", solicitud: "recibido", garantia: "recibido" },
  },
  {
    name: "Felipe Montoya",
    agent: "Jesús Zazueta",
    unit: "directo",
    scheme: "financiamiento",
    isNew: true,
    zone: "Ahome",
    crop: "maiz_blanco",
    ha: 45,
    yield: 11,
    phone: "6682233445",
    stage: "prospecto",
    notes: "Lo refirió Zazueta. Todavía no confirma hectáreas.",
    visits: [{ offsetHours: 6, purpose: "Primera visita", place: "Cafetería Los Mochis" }],
  },
  {
    name: "Integradora del Valle",
    agent: "Luis Cota",
    unit: "parafinanciero",
    scheme: "financiamiento",
    isNew: false,
    zone: "Salvador Alvarado",
    locality: "Guamúchil",
    crop: "maiz_blanco",
    ha: 400,
    yield: 12.8,
    phone: "6731122334",
    stage: "habilitado",
    notes: "Cuenta grande. Entrega de fertilizante la próxima semana.",
    docs: {
      ine: "validado",
      curp: "validado",
      rfc: "validado",
      domicilio: "validado",
      predio: "validado",
      predial: "validado",
      cuenta: "validado",
      croquis: "validado",
      solicitud: "validado",
      garantia: "validado",
      sat: "validado",
      fira: "recibido",
    },
  },
  {
    name: "Rosa Isela Cota",
    agent: "María Beltrán",
    unit: "directo",
    scheme: "acopio",
    isNew: true,
    zone: "Guasave",
    crop: "frijol",
    ha: 28,
    yield: 1.9,
    phone: "6873344556",
    stage: "visita",
    notes: "Quiere entregar frijol pinto. Cotizar precio de pizca.",
    visits: [{ offsetHours: -20, purpose: "Cuadrar volumen", place: "Parcela 12", status: "cumplida" }],
  },
];

export const loadExamples = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const profile = await requireProfile(sql, context.userId);
    const existing = await sql<{ n: number }>`
      select count(*)::int as n from producers
      where cycle = ${CYCLE} and owner_user_id = ${profile.userId}
    `;
    if (num(existing[0]?.n) > 0) {
      return { loaded: 0, already: true as const };
    }
    let loaded = 0;
    for (const spec of SEED) {
      const id = newId("prd");
      const volume = volumeOf(spec.ha, spec.yield);
      const financing = suggestedFinancing(spec.crop, spec.ha, spec.scheme);
      const agent = spec.agent;
      const relation = spec.relation ?? (spec.isNew ? "nuevo" : "recurrente");
      await sql`
        insert into producers (
          id, owner_user_id, comisionista_name, name, business_unit, scheme, is_new, relation,
          zone, locality, crop, hectares, yield_ton_ha, volume_ton, financing_mxn,
          phone, stage, blocker, notes, cycle, is_example
        ) values (
          ${id}, ${profile.userId}, ${agent}, ${spec.name}, ${spec.unit}, ${spec.scheme},
          ${relation === "nuevo"}, ${relation}, ${spec.zone}, ${spec.locality ?? null}, ${spec.crop}, ${spec.ha},
          ${spec.yield}, ${volume}, ${financing}, ${spec.phone}, ${spec.stage},
          ${spec.blocker ?? null}, ${spec.notes ?? null}, ${CYCLE}, ${true}
        )
      `;
      await insertDocSet(sql, id, spec.scheme);
      if (spec.docs) {
        for (const [docType, status] of Object.entries(spec.docs)) {
          await sql`
            update documents set status = ${status}, updated_at = now()
            where producer_id = ${id} and doc_type = ${docType}
          `;
        }
      }
      if (spec.visits) {
        for (const v of spec.visits) {
          const when = new Date(Date.now() + v.offsetHours * 3600 * 1000);
          await sql`
            insert into visits (id, producer_id, owner_user_id, scheduled_at, place, purpose, status)
            values (
              ${newId("vis")}, ${id}, ${profile.userId}, ${when.toISOString()},
              ${v.place}, ${v.purpose}, ${v.status ?? "programada"}
            )
          `;
        }
      }
      await logActivity(sql, id, profile.userId, "alta", `Se capturó a ${spec.name} (ejemplo ciclo ${CYCLE}).`);
      loaded += 1;
    }
    return { loaded, already: false as const };
  });

export const clearExamples = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const profile = await requireProfile(sql, context.userId);
    if (profile.role !== "gerente") {
      const mine = await sql<{ id: string }>`
        select id from producers where owner_user_id = ${profile.userId} and coalesce(is_example, false) = true
      `;
      for (const row of mine) await sql`delete from producers where id = ${row.id}`;
      return { removed: mine.length };
    }
    const removed = await wipeDemoProducers(sql);
    return { removed };
  });

export const purgeDemoData = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const me = await requireProfile(sql, context.userId);
    if (me.role !== "gerente") throw new Error("Solo gerencia puede quitar las pruebas.");
    const producers = await wipeDemoProducers(sql);
    let users = 0;
    try {
      const accounts = await sql<{ id: string; email: string | null }>`select id, email from "user"`;
      for (const u of accounts) {
        const email = u.email ? String(u.email) : null;
        if (!isDemoEmail(email)) continue;
        const uid = String(u.id);
        if (uid === me.userId) continue;
        const roleRows = await sql<{ role: string }>`select role from profiles where user_id = ${uid} limit 1`;
        if (roleRows[0]?.role === "gerente") continue;
        await sql`delete from producers where owner_user_id = ${uid}`;
        await sql`delete from visits where owner_user_id = ${uid}`;
        await sql`delete from profiles where user_id = ${uid}`;
        await sql`delete from "session" where "userId" = ${uid}`;
        try {
          await sql`delete from "account" where "userId" = ${uid}`;
        } catch {
          /* tabla puede no existir igual */
        }
        await sql`delete from "user" where id = ${uid}`;
        users += 1;
      }
    } catch {
      /* si no hay tabla user, igual ya se fueron los productores de ejemplo */
    }
    return { producers, users };
  });

export const listPaperwork = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: { agent?: string; docType?: string } | undefined) => d ?? {})
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const profile = await requireProfile(sql, context.userId);
    const { mine, agent } = agentScope(profile, data.agent);
    const want = (data.docType ?? "").trim();
    const rows = await sql<ProducerRow>`
      select p.id, p.name, p.stage, p.phone, p.comisionista_name, p.scheme,
             p.zone, d.doc_type, d.status
      from producers p
      join documents d on d.producer_id = p.id
      where p.cycle = ${CYCLE}
        and (${mine} = false or p.owner_user_id = ${profile.userId})
        and (${agent} = '' or p.comisionista_name = ${agent})
        and coalesce(p.rejection_kind, '') <> 'total'
        and d.status = 'pendiente'
      order by p.name, d.doc_type
    `;
    const map = new Map<
      string,
      {
        id: string;
        name: string;
        stage: StageId;
        phone: string | null;
        comisionistaName: string;
        zone: string;
        missing: { docType: string; label: string }[];
      }
    >();
    const counts = new Map<string, number>();
    for (const r of rows) {
      const id = String(r.id);
      const scheme = String(r.scheme);
      const docType = String(r.doc_type);
      const cur = map.get(id) ?? {
        id,
        name: String(r.name),
        stage: String(r.stage) as StageId,
        phone: r.phone ? String(r.phone) : null,
        comisionistaName: String(r.comisionista_name),
        zone: String(r.zone ?? ""),
        missing: [],
      };
      cur.missing.push({
        docType,
        label: docLabel(scheme, docType),
      });
      map.set(id, cur);
      counts.set(docType, (counts.get(docType) ?? 0) + 1);
    }
    let items = [...map.values()];
    if (want) items = items.filter((row) => row.missing.some((d) => d.docType === want));
    items.sort((a, b) => b.missing.length - a.missing.length);
    const tally = [...counts.entries()]
      .map(([docType, n]) => ({
        docType,
        n,
        label: items.find((i) => i.missing.some((d) => d.docType === docType))?.missing.find((d) => d.docType === docType)
          ?.label ?? docLabel("financiamiento", docType),
      }))
      .sort((a, b) => b.n - a.n);
    return { profile, items, counts: tally };
  });

export const setRejection = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (d: {
      id: string;
      kind: RejectionKind | "none";
      reason?: string | null;
      notes?: string | null;
      hectaresAuthorized?: number | null;
    }) => d,
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const profile = await requireProfile(sql, context.userId);
    const prev = await assertCanEdit(sql, profile, data.id);
    if (data.kind === "none") {
      const ha = prev.hectaresRequested || prev.hectares;
      const volume = volumeOf(ha, prev.yieldTonHa);
      const financing = prev.scheme === "financiamiento" ? loanOf(ha, prev.financingPerHa) : prev.financingMxn;
      await sql`
        update producers set
          rejection_kind = null,
          rejection_reason = null,
          rejection_notes = null,
          rejected_at = null,
          rejected_by = null,
          hectares = ${ha},
          volume_ton = ${volume},
          financing_mxn = ${financing},
          updated_at = now()
        where id = ${prev.id}
      `;
      await logActivity(sql, prev.id, profile.userId, "dictamen", "Se quitó el rechazo.");
      return { ok: true as const };
    }
    const reason = parseRejectionReason(data.reason);
    if (!reason) throw new Error("Elige el motivo del rechazo.");
    const notes = data.notes?.trim() || null;
    if (data.kind === "total") {
      await sql`
        update producers set
          rejection_kind = 'total',
          rejection_reason = ${reason},
          rejection_notes = ${notes},
          rejected_at = now(),
          rejected_by = ${profile.displayName},
          hectares_requested = ${prev.hectaresRequested || prev.hectares},
          stage = 'cerrado',
          updated_at = now()
        where id = ${prev.id}
      `;
      await logActivity(
        sql,
        prev.id,
        profile.userId,
        "dictamen",
        `Rechazo total: ${rejectionReasonLabel(reason)}${notes ? ` — ${notes}` : ""}.`,
      );
      return { ok: true as const };
    }
    const requested = prev.hectaresRequested || prev.hectares;
    const authorized = Math.max(0, num(data.hectaresAuthorized));
    if (!authorized || authorized >= requested) {
      throw new Error("Pon las hectáreas que sí se autorizaron, menos de las que pidió.");
    }
    const volume = volumeOf(authorized, prev.yieldTonHa);
    const financing = prev.scheme === "financiamiento" ? loanOf(authorized, prev.financingPerHa) : 0;
    await sql`
      update producers set
        rejection_kind = 'parcial',
        rejection_reason = ${reason},
        rejection_notes = ${notes},
        rejected_at = now(),
        rejected_by = ${profile.displayName},
        hectares_requested = ${requested},
        hectares = ${authorized},
        volume_ton = ${volume},
        financing_mxn = ${financing},
        updated_at = now()
      where id = ${prev.id}
    `;
    await logActivity(
      sql,
      prev.id,
      profile.userId,
      "dictamen",
      `Rechazo parcial: de ${requested} ha a ${authorized} ha. ${rejectionReasonLabel(reason)}${notes ? ` — ${notes}` : ""}.`,
    );
    return { ok: true as const };
  });

export const listAnnouncements = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await requireProfile(sql, context.userId);
    const rows = await sql<ProducerRow>`
      select * from announcements order by created_at desc limit 20
    `;
    const items: Announcement[] = rows.map((r) => ({
      id: String(r.id),
      authorUserId: String(r.author_user_id),
      authorName: String(r.author_name),
      kind: r.kind === "productores" ? "productores" : "equipo",
      stage: r.stage ? (String(r.stage) as StageId) : null,
      title: String(r.title ?? ""),
      body: String(r.body ?? ""),
      createdAt: iso(r.created_at),
    }));
    return { items };
  });

export const postAnnouncement = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (d: { kind: "equipo" | "productores"; title?: string; body: string; stage?: string | null }) => d,
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await requireProfile(sql, context.userId);
    if (me.role !== "gerente") throw new Error("Solo gerencia manda avisos.");
    const body = data.body.trim();
    if (!body) throw new Error("Escribe el recado.");
    const title = (data.title ?? "").trim() || (data.kind === "equipo" ? "Aviso al equipo" : "Aviso a productores");
    const id = newId("anuncio");
    await sql`
      insert into announcements (id, author_user_id, author_name, kind, stage, title, body)
      values (
        ${id}, ${me.userId}, ${me.displayName}, ${data.kind},
        ${data.kind === "productores" ? data.stage || null : null},
        ${title}, ${body}
      )
    `;
    return { id };
  });

export const listBroadcastTargets = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: { stage?: string } | undefined) => d ?? {})
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await requireProfile(sql, context.userId);
    if (me.role !== "gerente") throw new Error("Solo gerencia manda a productores.");
    const stage = (data.stage ?? "").trim();
    const rows = await listProducersRows(sql, me, { stage: stage || undefined });
    const targets = rows
      .filter((p) => p.rejectionKind !== "total")
      .map((p) => ({
        id: p.id,
        name: p.name,
        phone: p.phone,
        comisionistaName: p.comisionistaName,
        stage: p.stage,
        zone: p.zone,
      }));
    return { targets };
  });

function mapOfficePerson(row: Record<string, unknown>): OfficePerson {
  return {
    id: String(row.id),
    name: String(row.name),
    title: String(row.title ?? ""),
    phone: String(row.phone ?? ""),
    forInvite: bool(row.for_invite),
    forAviso: bool(row.for_aviso),
  };
}

export const listOfficePeople = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await requireProfile(sql, context.userId);
    const rows = await sql<Record<string, unknown>>`
      select id, name, title, phone, for_invite, for_aviso
      from office_people
      order by name
    `;
    return { people: rows.map(mapOfficePerson) };
  });

export const saveOfficePerson = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (d: {
      id?: string;
      name: string;
      title?: string;
      phone: string;
      forInvite: boolean;
      forAviso: boolean;
    }) => d,
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await requireProfile(sql, context.userId);
    if (me.role !== "gerente") throw new Error("Solo gerencia puede cargar a la gente de oficina.");
    const name = data.name.trim();
    if (!name) throw new Error("Escribe el nombre.");
    const phone = digitsPhone(data.phone);
    if (phone.length < 10) throw new Error("Falta el WhatsApp (10 dígitos).");
    const title = (data.title ?? "").trim();
    const id = data.id?.trim() || newId("ofc");
    await sql`
      insert into office_people (id, name, title, phone, for_invite, for_aviso)
      values (${id}, ${name}, ${title}, ${phone}, ${data.forInvite}, ${data.forAviso})
      on conflict (id) do update set
        name = excluded.name,
        title = excluded.title,
        phone = excluded.phone,
        for_invite = excluded.for_invite,
        for_aviso = excluded.for_aviso
    `;
    return { id };
  });

export const deleteOfficePerson = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await requireProfile(sql, context.userId);
    if (me.role !== "gerente") throw new Error("Solo gerencia puede borrar a alguien de oficina.");
    await sql`delete from office_people where id = ${data.id}`;
    return { ok: true as const };
  });

export const pingOffice = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (d: {
      personId: string;
      kind: "invite" | "aviso";
      producerId?: string;
      visitId?: string;
    }) => d,
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const profile = await requireProfile(sql, context.userId);
    const people = await sql<Record<string, unknown>>`
      select * from office_people where id = ${data.personId} limit 1
    `;
    const person = people[0] ? mapOfficePerson(people[0]) : null;
    if (!person) throw new Error("No está esa persona de oficina.");

    let message: string;
    let producerId: string | null = data.producerId ?? null;

    if (data.kind === "aviso") {
      const digest = await buildOfficeDigest(sql, profile, "");
      message = officeDigestMessage({ personName: person.name, lines: digest.lines });
    } else if (data.visitId) {
      const rows = await sql<ProducerRow>`
        select v.*, p.name as producer_name, p.comisionista_name, p.crop, p.hectares, p.zone, p.id as producer_id
        from visits v
        join producers p on p.id = v.producer_id
        where v.id = ${data.visitId}
        limit 1
      `;
      const v = rows[0];
      if (!v) throw new Error("No está esa cita.");
      producerId = String(v.producer_id);
      message = inviteToVisitMessage({
        personName: person.name,
        agentName: String(v.comisionista_name ?? profile.displayName),
        producerName: String(v.producer_name ?? ""),
        when: new Date(iso(v.scheduled_at)),
        purpose: v.purpose ? String(v.purpose) : null,
        place: v.place ? String(v.place) : null,
        crop: cropLabel(String(v.crop ?? "")),
        hectares: num(v.hectares),
        zone: v.zone ? String(v.zone) : null,
      });
    } else if (data.producerId) {
      const producer = await assertCanEdit(sql, profile, data.producerId);
      message = inviteToCloseMessage({
        personName: person.name,
        agentName: producer.comisionistaName || profile.displayName,
        producerName: producer.name,
        crop: cropLabel(producer.crop),
        hectares: producer.hectares,
        zone: producer.zone,
        stageLabel: stageMeta(producer.stage).label,
      });
    } else {
      throw new Error("Falta el productor o la cita.");
    }

    await sql`
      insert into office_pings (id, person_id, person_name, kind, producer_id, message, user_id)
      values (${newId("png")}, ${person.id}, ${person.name}, ${data.kind}, ${producerId}, ${message}, ${profile.userId})
    `;
    if (producerId) {
      const label = data.kind === "aviso" ? "Se avisó a" : "Se invitó a";
      await logActivity(sql, producerId, profile.userId, "oficina", `${label} ${person.name} por WhatsApp.`);
    }
    const href = whatsappHref(person.phone, message);
    if (!href) throw new Error("Esa persona no tiene WhatsApp cargado.");
    return { href, personName: person.name };
  });

export const listOfficePings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const me = await requireProfile(sql, context.userId);
    if (me.role !== "gerente") return { pings: [] as OfficePing[] };
    const rows = await sql<Record<string, unknown>>`
      select id, person_name, kind, producer_id, message, created_at
      from office_pings
      order by created_at desc
      limit 20
    `;
    return {
      pings: rows.map((r) => ({
        id: String(r.id),
        personName: String(r.person_name),
        kind: r.kind === "aviso" ? ("aviso" as const) : ("invite" as const),
        producerId: r.producer_id ? String(r.producer_id) : null,
        message: String(r.message),
        createdAt: iso(r.created_at),
      })),
    };
  });

export const getOfficeDigest = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: { agent?: string } | undefined) => d ?? {})
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const profile = await requireProfile(sql, context.userId);
    const peopleRows = await sql<Record<string, unknown>>`
      select id, name, title, phone, for_invite, for_aviso
      from office_people where for_aviso = true order by name
    `;
    const digest = await buildOfficeDigest(sql, profile, data.agent);
    return {
      people: peopleRows.map(mapOfficePerson),
      lines: digest.lines,
      count: digest.lines.length,
    };
  });

async function buildOfficeDigest(sql: Sql, profile: Profile, agentRaw?: string) {
  const { mine, agent } = agentScope(profile, agentRaw);
  const lines: string[] = [];

  const visits = await sql<ProducerRow>`
    select v.scheduled_at, v.purpose, v.place, p.name as producer_name, p.comisionista_name
    from visits v
    join producers p on p.id = v.producer_id
    where v.status = 'programada'
      and v.scheduled_at >= now() - interval '1 hour'
      and v.scheduled_at < now() + interval '2 days'
      and (${mine} = false or v.owner_user_id = ${profile.userId})
      and (${agent} = '' or p.comisionista_name = ${agent})
    order by v.scheduled_at asc
    limit 8
  `;
  for (const v of visits) {
    const when = formatAppDateTime(iso(v.scheduled_at), {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
    const who = mine ? "" : ` (${v.comisionista_name})`;
    lines.push(
      `Cita ${when}: ${v.producer_name}${who}${v.place ? ` · ${v.place}` : ""}`,
    );
  }

  const closing = await sql<ProducerRow>`
    select name, comisionista_name, hectares, crop, stage, zone
    from producers
    where cycle = ${CYCLE}
      and stage in ('interesado', 'papeleria', 'evaluacion')
      and (${mine} = false or owner_user_id = ${profile.userId})
      and (${agent} = '' or comisionista_name = ${agent})
    order by updated_at desc
    limit 6
  `;
  for (const p of closing) {
    const who = mine ? "" : ` · ${p.comisionista_name}`;
    lines.push(
      `${stageMeta(String(p.stage)).label}: ${p.name}, ${num(p.hectares)} ha ${cropLabel(String(p.crop))}${who}`,
    );
  }

  return { lines: lines.slice(0, 12) };
}
