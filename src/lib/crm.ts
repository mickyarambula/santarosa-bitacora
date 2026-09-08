import { periodSchema, periodRange, type PeriodSelection } from "./period";
import { createHash, randomBytes } from "node:crypto";
import { accountMatches } from "./account-identity";
import { writeAudit } from "./crm-audit";
import { previewConsolidation, consolidateAccounts } from "./account-consolidation";
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { producerInputSchema } from "./crm-policy";
import {
  CYCLE,
  needsApproval,
  DOC_CATALOG,
  DOC_STATUS,
  VISIT_STATUS,
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
  type RelationId,
  type SchemeId,
  type StageId,
} from "@/lib/catalog";
import { csvWithBom, toSpreadsheetXml } from "@/lib/excel";
import { accessCodeOk, hashAccessCode, namesMatchForDelete, normalizeAccessCode } from "@/lib/lock";
import {
  duplicateMessage,
  findDuplicateProducer,
  groupDuplicates,
  groupReason,
  phoneKey,
  pickWinner,
  type DupRow,
} from "@/lib/producer-match";
import { formatAppDateTime, isAppThisWeek, isAppToday, parseLocalDateTime } from "@/lib/datetime";
import {
  followUpMessage,
  inviteToCloseMessage,
  inviteToVisitMessage,
  officeDigestMessage,
  paperworkMessage,
  visitConfirmMessage,
} from "@/lib/reminders";
import {
  bool,
  daysAgoLabel,
  digitsPhone,
  loanOf,
  newId,
  num,
  suggestedFinancing,
  suggestedPerHa,
  volumeOf,
  whatsappHref,
} from "@/lib/utils";
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
  return { mine: profile.role === "comisionista", agent: raw };
}

type ProducerRow = Record<string, unknown>;
type ProfileRow = {
  user_id: string;
  display_name: string;
  role: string;
  status?: string;
  merged_into_user_id?: string | null;
  duplicate_review?: boolean;
  access_admin?: boolean;
  office_owner_ids?: string[];
  email?: string | null;
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
    mergedIntoUserId: row.merged_into_user_id ?? null,
    duplicateReview: Boolean(row.duplicate_review),
    role: (["gerente", "oficina"].includes(row.role) ? row.role : "comisionista") as Role,
    accessAdmin: Boolean(row.access_admin),
    officeOwnerIds: row.office_owner_ids ?? [],
    status: row.status === "bloqueado" ? "bloqueado" : "activo",
    phone: row.phone,
    createdAt: iso(row.created_at),
  };
}

function mapProducer(row: ProducerRow): Producer {
  const relation = parseRelation(row.relation, bool(row.is_new));
  return {
    id: String(row.id),
    ownerUserId: row.owner_user_id ? String(row.owner_user_id) : "",
    portfolioKind: (row.portfolio_kind ?? "comisionista") as Producer["portfolioKind"],
    attentionUserId: row.attention_user_id ? String(row.attention_user_id) : null,
    capturedBy: row.captured_by ? String(row.captured_by) : null,
    intakeChannel: row.intake_channel ? String(row.intake_channel) : null,
    comisionistaName: String(row.comisionista_name),
    name: String(row.name),
    businessUnit: (row.business_unit === "directo"
      ? "directo"
      : "parafinanciero") as Producer["businessUnit"],
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
    closeKind: row.close_kind ? String(row.close_kind) : null,
    closeReason: row.close_reason ? String(row.close_reason) : null,
    archivedAt: row.archived_at ? iso(row.archived_at) : null,
    archiveReason: row.archive_reason ? String(row.archive_reason) : null,
    stageEnteredAt: row.stage_entered_at ? iso(row.stage_entered_at) : iso(row.created_at),
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
      select id, name from producers where archived_at is null and cycle = ${CYCLE}
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
      groupTitularName: titularId ? (titularNames.get(titularId) ?? null) : null,
    };
  });
}

function mapVisit(row: ProducerRow): Visit {
  return {
    id: String(row.id),
    producerId: String(row.producer_id),
    producerName: String(row.producer_name ?? ""),
    ownerUserId: row.owner_user_id ? String(row.owner_user_id) : "",
    scheduledAt: iso(row.scheduled_at),
    place: row.place ? String(row.place) : null,
    purpose: row.purpose ? String(row.purpose) : null,
    status: String(row.status ?? "programada") as Visit["status"],
    notes: row.notes ? String(row.notes) : null,
    outcome: row.outcome ? String(row.outcome) : null,
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
  const ids = rows.filter((r) => bool(r.is_example)).map((r) => String(r.id));
  for (const id of ids) {
    await sql`delete from producers where id = ${id}`;
  }
  await sql`
    delete from producer_groups g
    where not exists (select 1 from producers p where p.group_id = g.id)
  `;
  return ids.length;
}

async function ensureProfile(
  sql: Sql,
  userId: string,
  displayName: string | null | undefined,
  accessCode?: string | null,
  invitationToken?: string | null,
): Promise<Profile> {
  const existing = await sql<ProfileRow>`
    select user_id, display_name, role, status, phone, created_at, merged_into_user_id, duplicate_review, access_admin, office_owner_ids
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

  const authName = (
    await sql<{ name: string }>`select name from "user" where id=${userId}`
  )[0]?.name?.trim();
  const checkedName = authName || name;
  const possibleDuplicates = await accountMatches(sql, userId, checkedName);
  const duplicateReview = possibleDuplicates.length > 0;
  if (invitationToken && !revoked[0] && !duplicateReview) {
    const hash = createHash("sha256").update(invitationToken).digest("hex");
    const auth = (await sql<{ email: string }>`select email from "user" where id=${userId}`)[0];
    const invite = (
      await sql<{
        id: string;
      }>`select id from team_invitations where token_hash=${hash} and email=${auth?.email?.trim().toLowerCase() ?? ""} and expires_at>now() and claimed_at is null and revoked_at is null`
    )[0];
    if (!invite)
      throw new Error(
        "La invitación venció, fue usada o corresponde a otro correo. Revisa el enlace con gerencia.",
      );
    status = "activo";
    await sql`update team_invitations set claimed_at=now(),claimed_by=${userId} where id=${invite.id}`;
    await writeAudit(
      sql,
      { userId, displayName: checkedName },
      "invitacion",
      invite.id,
      "aceptar",
      null,
      { userId },
    );
  }
  if (duplicateReview) status = "bloqueado";
  await sql`
    insert into profiles (user_id, display_name, role, status,duplicate_review,access_admin)
    values (${userId}, ${checkedName}, ${role}, ${status},${duplicateReview},${isFirst})
  `;
  const created = await sql<ProfileRow>`
    select user_id, display_name, role, status, phone, created_at, merged_into_user_id, duplicate_review, access_admin, office_owner_ids
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

export async function requireProfile(
  sql: Sql,
  userId: string,
  allowOffice = false,
): Promise<Profile> {
  const rows = await sql<ProfileRow>`select * from profiles where user_id = ${userId} limit 1`;
  if (!rows[0]) throw new Error("Tu perfil está pendiente. Vuelve a entrar al CRM.");
  const profile = mapProfile(rows[0]);
  const revoked = await sql`select user_id from revoked_users where user_id = ${userId}`;
  if (profile.status === "bloqueado" || revoked.length) throw new Error("LOCKED");
  if (profile.role === "oficina" && !allowOffice)
    throw new Error("Esta función requiere permisos de Gerencia.");
  return profile;
}

function assertAccessAdmin(p: Profile) {
  if (p.role !== "gerente" || !p.accessAdmin)
    throw new Error("Solo gerencia con administración de accesos puede hacer este cambio.");
}

async function assertOfficeFile(sql: Sql, p: Profile, id: string) {
  const rows =
    await sql<ProducerRow>`select * from producers where id=${id} and archived_at is null`;
  const row = rows[0];
  if (!row || (p.role !== "gerente" && p.role !== "oficina"))
    throw new Error("Expediente fuera de tus carteras asignadas.");
  return row;
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
    ownerUserId: r.owner_user_id ? String(r.owner_user_id) : "",
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
      select ${newId("doc")}, ${producerId}, ${doc.id}, 'pendiente'
      where not exists (select 1 from documents where producer_id = ${producerId} and doc_type = ${doc.id})
    `;
  }
}

async function loadGroup(
  sql: Sql,
  groupId: string | null | undefined,
  profile: Profile,
): Promise<ProducerGroup | null> {
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
  if (!g || (profile.role === "comisionista" && g.owner_user_id !== profile.userId)) return null;
  const memberRows = await sql<ProducerRow>`
    select * from producers where archived_at is null and group_id = ${groupId} and cycle = ${CYCLE}
      and (${profile.role !== "comisionista"} or owner_user_id = ${profile.userId}) order by name
  `;
  const producers = await withGroupMeta(sql, memberRows.map(mapProducer));
  const titularId = g.titular_producer_id ? String(g.titular_producer_id) : null;
  const titular =
    producers.find((p) => p.id === titularId) ?? producers.find((p) => p.groupRole === "titular");
  return {
    id: String(g.id),
    name: String(g.name),
    ownerUserId: g.owner_user_id ? String(g.owner_user_id) : "",
    comisionistaName: String(g.comisionista_name),
    titularProducerId: titular?.id ?? null,
    titularName: titular?.name ?? null,
    notes: g.notes ? String(g.notes) : null,
    members: producers.length,
    hectares: producers.reduce((s, p) => s + p.hectares, 0),
    financing: producers.reduce((s, p) => s + p.financingMxn, 0),
    volume: producers.reduce((s, p) => s + p.volumeTon, 0),
    producers,
  };
}

const activeDocumentKeys = Object.entries(DOC_CATALOG).flatMap(([scheme, docs]) =>
  docs.map((d) => `${scheme}:${d.id}`),
);

/** Keep archived scheme rows in storage, but expose only the current checklist. */
function visibleDocuments(rows: ProducerRow[], scheme: string, producerId: string): DocumentItem[] {
  const byType = new Map(rows.map((r) => [String(r.doc_type), r]));
  return docsForScheme(scheme).flatMap((d) => {
    const row = byType.get(d.id);
    return row
      ? [mapDoc(row, scheme)]
      : [
          {
            id: `missing:${d.id}`,
            producerId,
            docType: d.id,
            label: d.label,
            required: d.required,
            status: "pendiente" as const,
            notes: null,
            updatedAt: "",
            missing: true,
          },
        ];
  });
}

async function repairGroup(sql: Sql, groupId: string | null) {
  if (!groupId) return;
  const groups = await sql<{
    titular_producer_id: string | null;
  }>`select titular_producer_id from producer_groups where id = ${groupId}`;
  if (!groups[0]) return;
  const members = await sql<{
    id: string;
    group_role: string | null;
  }>`select id, group_role from producers where group_id = ${groupId} order by created_at, id`;
  if (!members.length) {
    await sql`delete from producer_groups where id = ${groupId}`;
    return;
  }
  const titular =
    members.find((m) => m.id === groups[0].titular_producer_id) ??
    members.find((m) => m.group_role === "titular") ??
    members[0]!;
  await sql`update producer_groups set titular_producer_id = ${titular.id}, updated_at = now() where id = ${groupId}`;
  await sql`update producers set group_role = case when id = ${titular.id} then 'titular'
    when group_role = 'titular' or group_role is null then 'familiar' else group_role end where group_id = ${groupId}`;
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
  const producer = await assertCanEdit(sql, profile, producerId);
  const oldGroup = producer.groupId;
  let groupId = opts.groupId?.trim() || "";
  const newName = (opts.newGroupName ?? "").trim();
  if (!groupId && newName) {
    groupId = newId("grp");
    await sql`insert into producer_groups (id, name, owner_user_id, comisionista_name, cycle, portfolio_kind)
      values (${groupId}, ${newName}, ${producer.ownerUserId || null}, ${producer.comisionistaName}, ${CYCLE}, ${producer.portfolioKind ?? "comisionista"})`;
  }
  if (groupId) {
    const rows = await sql<{
      owner_user_id: string;
      cycle: string;
      portfolio_kind: string;
    }>`select owner_user_id, cycle, portfolio_kind from producer_groups where id = ${groupId}`;
    if (!rows[0]) throw new Error("No encontramos ese grupo.");
    if (
      rows[0].cycle !== CYCLE ||
      (rows[0].owner_user_id ?? "") !== producer.ownerUserId ||
      rows[0].portfolio_kind !== producer.portfolioKind
    ) {
      throw new Error(
        "El grupo y sus fichas deben tener el mismo responsable. Pide a gerencia que los asigne primero.",
      );
    }
  }
  const role = groupId ? (parseGroupRole(opts.groupRole) ?? "familiar") : null;
  await sql`update producers set group_id = ${groupId || null}, group_role = ${role}, updated_at = now() where id = ${producerId}`;
  if (groupId && role === "titular") {
    await sql`update producer_groups set titular_producer_id = ${producerId} where id = ${groupId}`;
  }
  await repairGroup(sql, groupId || null);
  if (oldGroup !== groupId) await repairGroup(sql, oldGroup);
  if (oldGroup !== (groupId || null))
    await logActivity(
      sql,
      producerId,
      profile.userId,
      "grupo",
      groupId ? "Se vinculó explícitamente al grupo." : "Se separó del grupo.",
    );
}

async function resolveOwner(
  sql: Sql,
  me: Profile,
  requested?: string,
  current?: Producer,
): Promise<{ userId: string | null; displayName: string }> {
  if (current && current.portfolioKind !== "comisionista") {
    if (requested) throw new Error("Cambia la cartera desde Asignación.");
    return { userId: null, displayName: current.comisionistaName };
  }
  const id = requested || current?.ownerUserId || me.userId;
  if (me.role === "comisionista" && id !== me.userId)
    throw new Error("Solo gerencia puede asignar una cartera.");
  if (current && id !== current.ownerUserId)
    throw new Error("Cambia la cartera desde Asignación, con su motivo y revisión de tareas.");
  const rows = await sql<ProfileRow>`select * from profiles where user_id=${id}`;
  if (!rows[0]) throw new Error("Elige una cuenta real como responsable.");
  if (rows[0].role === "oficina")
    throw new Error("Elige un comisionista; Oficina puede atender la cartera de empresa.");
  if (id !== current?.ownerUserId && (rows[0].status !== "activo" || rows[0].merged_into_user_id))
    throw new Error("El responsable debe ser una cuenta activa.");
  return { userId: id, displayName: rows[0].display_name };
}
export async function resolveAttention(
  sql: Sql,
  me: Profile,
  id: string,
  portfolioKind: string,
  ownerId: string | null,
) {
  const p = (
    await sql<ProfileRow>`select * from profiles where user_id=${id} and status='activo' and merged_into_user_id is null`
  )[0];
  if (!p || (await sql`select user_id from revoked_users where user_id=${id}`).length)
    throw new Error("Elige una persona activa para atender.");
  if (p.role === "comisionista" && (portfolioKind !== "comisionista" || id !== ownerId))
    throw new Error("La atención corresponde al comisionista de la cartera, Oficina o Gerencia.");
  if (me.role === "comisionista" && id !== me.userId)
    throw new Error("Oficina o Gerencia asignan la atención compartida.");
  return p.display_name;
}

async function assertStageChange(sql: Sql, profile: Profile, stage: string, previous?: Producer) {
  if (!STAGES.some((s) => s.id === stage)) throw new Error("Etapa no válida.");
  if (previous?.stage === stage) return;
  if (needsApproval(stage) || (previous && needsApproval(previous.stage))) {
    if (profile.role !== "gerente")
      throw new Error("Solo gerencia puede autorizar o cambiar una habilitación o acopio.");
  }
  if (needsApproval(stage)) {
    if (!previous)
      throw new Error("Primero guarda al productor y completa la revisión de su expediente.");
    if (previous.rejectionKind === "total")
      throw new Error("Primero revisa y quita el rechazo total.");
    const rows = await sql<ProducerRow>`select * from documents where producer_id = ${previous.id}`;
    const required = docsForScheme(previous.scheme).filter((d) => d.required);
    if (
      required.some(
        (d) =>
          !rows.some(
            (r) => r.doc_type === d.id && (r.status === "validado" || r.status === "no_aplica"),
          ),
      )
    ) {
      throw new Error(
        "Gerencia debe validar los documentos obligatorios o justificar que no aplican antes de autorizar.",
      );
    }
  }
}

export async function logActivity(
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
  opts: {
    stage?: string;
    q?: string;
    mine?: boolean;
    crop?: string;
    zone?: string;
    agent?: string;
    relation?: string;
  },
): Promise<Producer[]> {
  const { mine, agent } = agentScope(profile, opts.agent);
  const forceMine = opts.mine === true;
  const scopedMine = forceMine || mine;
  const relation = opts.relation?.trim() ?? "";
  const rows = await sql<ProducerRow>`
    select * from producers
    where archived_at is null and cycle = ${CYCLE}
      and (${scopedMine} = false or owner_user_id = ${profile.userId})
      and (${agent} = '' or (comisionista_name = ${agent} or owner_user_id = ${agent.startsWith("uid:") ? agent.slice(4) : ""}))
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

export async function assertCanEdit(
  sql: Sql,
  profile: Profile,
  producerId: string,
  allowArchived = false,
): Promise<Producer> {
  const rows = await sql<ProducerRow>`select * from producers where id = ${producerId} limit 1`;
  const producer = rows[0] ? mapProducer(rows[0]) : null;
  if (!producer) throw new Error("No encontramos a ese productor.");
  if (profile.role === "comisionista" && producer.ownerUserId !== profile.userId) {
    throw new Error("Este productor lo lleva otro comisionista.");
  }
  if (producer.archivedAt && !allowArchived)
    throw new Error("Esta ficha está archivada. Gerencia puede restaurarla.");
  return (await withGroupMeta(sql, [producer]))[0]!;
}

export const bootstrap = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (
      d:
        | {
            displayName?: string | null;
            accessCode?: string | null;
            invitationToken?: string | null;
          }
        | undefined,
    ) => d ?? {},
  )
  .handler(async ({ context, data }) => {
    return (await getSql()).transaction(async (sql) => {
      const fromSession = await getSessionName(context.userId);
      const name = (data.displayName ?? "").trim() || fromSession;
      const profile = await ensureProfile(
        sql,
        context.userId,
        name,
        data.accessCode,
        data.invitationToken,
      );
      if (profile.mergedIntoUserId) {
        const target = await sql<{
          email: string;
        }>`select email from "user" where id=${profile.mergedIntoUserId}`;
        return { profile: { ...profile, mergedIntoEmail: target[0]?.email ?? null } };
      }
      return { profile };
    });
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
    assertAccessAdmin(me);
    if (me.role !== "gerente") throw new Error("Solo gerencia puede ver el candado.");
    const lock = await readLock(sql);
    return { enabled: lock.enabled };
  });

export const setLock = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { enabled: boolean; code?: string | null }) => d)
  .handler(async ({ context, data }) => {
    return (await getSql()).transaction(async (sql) => {
      const me = await requireProfile(sql, context.userId);
      assertAccessAdmin(me);
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
  });

export const setMemberStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { userId: string; status: AccountStatus; identityReviewReason?: string }) => d)
  .handler(async ({ context, data }) => {
    return (await getSql()).transaction(async (sql) => {
      const me = await requireProfile(sql, context.userId);
      assertAccessAdmin(me);
      if (me.role !== "gerente") throw new Error("Solo gerencia puede inhabilitar cuentas.");
      if (!["activo", "bloqueado"].includes(data.status))
        throw new Error("Estado de cuenta no válido.");
      if (data.userId === me.userId) throw new Error("No puedes inhabilitarte a ti mismo.");
      const rows = await sql<ProfileRow>`
      select user_id, display_name, role, status, phone, created_at, merged_into_user_id, duplicate_review, access_admin, office_owner_ids
      from profiles where user_id = ${data.userId} limit 1
    `;
      const target = rows[0] ? mapProfile(rows[0]) : null;
      if (!target) throw new Error("No encontramos esa cuenta.");
      if (target.mergedIntoUserId)
        throw new Error("La cuenta unificada se conserva como referencia del historial.");
      if (data.status === "bloqueado" && target.role === "gerente") {
        const gerentes = await sql<{ n: number }>`
        select count(*)::int as n from profiles where role = 'gerente' and status = 'activo'
      `;
        if (num(gerentes[0]?.n) <= 1)
          throw new Error("Tiene que quedar al menos una gerencia activa.");
      }
      if (rows[0]?.merged_into_user_id)
        throw new Error("Esta cuenta fue unificada; usa la cuenta de destino.");
      const identityReason = data.identityReviewReason?.trim() ?? "";
      if (data.status === "activo" && target.duplicateReview) {
        if (identityReason.length < 10 || identityReason.length > 1000)
          throw new Error(
            "Revisa la coincidencia y explica por qué son personas distintas antes de habilitar (10 a 1,000 caracteres).",
          );
        const matches = await accountMatches(sql, target.userId, target.displayName, target.phone);
        await writeAudit(
          sql,
          me,
          "cuenta",
          target.userId,
          "autorizar_homonimo",
          {
            name: target.displayName,
            matches: matches.map((m) => ({ userId: m.user_id, name: m.display_name })),
          },
          { reason: identityReason },
        );
      }
      await sql`update profiles set status = ${data.status},duplicate_review=case when ${data.status}='activo' then false else duplicate_review end where user_id = ${target.userId}`;
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
  });

export const deleteMember = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { userId: string; confirmName: string; wipeCartera?: boolean }) => d)
  .handler(async ({ context, data }) => {
    return (await getSql()).transaction(async (sql) => {
      const me = await requireProfile(sql, context.userId);
      assertAccessAdmin(me);
      if (me.role !== "gerente") throw new Error("Solo gerencia puede eliminar cuentas.");
      if (data.userId === me.userId) throw new Error("No puedes borrar tu propia cuenta.");
      const rows = await sql<ProfileRow>`
      select user_id, display_name, role, status, phone, created_at, merged_into_user_id, duplicate_review, access_admin, office_owner_ids
      from profiles where user_id = ${data.userId} limit 1
    `;
      const target = rows[0] ? mapProfile(rows[0]) : null;
      if (!target) throw new Error("No encontramos esa cuenta.");
      const references =
        await sql`select user_id from profiles where merged_into_user_id=${target.userId} limit 1`;
      if (references.length)
        throw new Error(
          "Esta cuenta conserva carteras unificadas. Reasigna y revisa su historial antes de eliminarla.",
        );
      if (target.mergedIntoUserId)
        throw new Error("La cuenta unificada se conserva como referencia del historial.");
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
      if (data.wipeCartera)
        throw new Error(
          "Las carteras no se borran. Unifica o reasigna y después inhabilita la cuenta.",
        );
      const owned =
        await sql`select id from producers where owner_user_id=${target.userId} limit 1`;
      if (owned.length)
        throw new Error("Reasigna o unifica la cartera antes de inhabilitar desde esta opción.");
      await sql`
      insert into revoked_users (user_id, revoked_by, reason)
      values (${target.userId}, ${me.userId}, 'eliminado')
      on conflict (user_id) do nothing
    `;
      await sql`update profiles set status='bloqueado' where user_id=${target.userId}`;
      await writeAudit(
        sql,
        me,
        "cuenta",
        target.userId,
        "inhabilitar",
        { status: target.status },
        { reason: "Baja de acceso; historial conservado" },
      );
      await sql`delete from "session" where "userId" = ${target.userId}`;
      return { ok: true as const };
    });
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { displayName: string; phone?: string | null }) => d)
  .handler(async ({ context, data }) => {
    return (await getSql()).transaction(async (sql) => {
      const profile = await requireProfile(sql, context.userId, true);
      const displayName = data.displayName.trim();
      if (!displayName) throw new Error("Escribe cómo te dicen.");
      const phone = data.phone?.trim() || null;
      if (displayName !== profile.displayName || phone !== profile.phone) {
        const matches = await accountMatches(sql, profile.userId, displayName, phone);
        const oldMatches = await accountMatches(
          sql,
          profile.userId,
          profile.displayName,
          profile.phone,
        );
        if (matches.some((m) => !oldMatches.some((old) => old.user_id === m.user_id)))
          throw new Error(
            "Ese nombre o teléfono coincide con otra cuenta. Pide a gerencia revisar el acceso antes de crear una duplicidad.",
          );
      }
      await sql`
      update profiles
      set display_name = ${displayName},
          phone = ${data.phone?.trim() || null}
      where user_id = ${profile.userId}
    `;
      await sql`update producers set comisionista_name=${displayName} where owner_user_id=${profile.userId}`;
      await sql`update producer_groups set comisionista_name=${displayName} where owner_user_id=${profile.userId}`;
      await writeAudit(
        sql,
        profile,
        "cuenta",
        profile.userId,
        "perfil",
        { displayName: profile.displayName, phone: profile.phone },
        { displayName, phone: data.phone?.trim() || null },
      );
      return { ok: true as const };
    });
  });

export const listTeam = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const me = await requireProfile(sql, context.userId, true);
    const profiles = await sql<ProfileRow>`
      select p.*,u.email from profiles p left join "user" u on u.id=p.user_id
      where (${me.role !== "comisionista"} or p.user_id=${me.userId}) and p.merged_into_user_id is null order by p.created_at asc
    `;
    const agents: (Profile & {
      email: string | null;
      producers: number;
      hectares: number;
      volume: number;
      financing: number;
    })[] = [];
    for (const row of profiles) {
      const p = mapProfile(row);
      const stats = await sql<{ n: number; ha: string; vol: string; fin: string }>`
        select count(*)::int as n,
               coalesce(sum(hectares),0) as ha,
               coalesce(sum(volume_ton),0) as vol,
               coalesce(sum(financing_mxn),0) as fin
        from producers
        where archived_at is null and cycle = ${CYCLE} and owner_user_id = ${p.userId}
      `;
      agents.push({
        ...p,
        email: row.email ?? null,
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
    return (await getSql()).transaction(async (sql) => {
      const me = await requireProfile(sql, context.userId);
      assertAccessAdmin(me);
      if (me.role !== "gerente") throw new Error("Solo gerencia puede cambiar roles.");
      if (!["gerente", "comisionista", "oficina"].includes(data.role))
        throw new Error("Rol no válido.");
      if (data.userId === me.userId && data.role !== "gerente") {
        throw new Error(
          "No puedes quitarte el rol de gerencia a ti mismo. Pídele a otro de gerencia que te baje.",
        );
      }
      if (data.role !== "gerente") {
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
      const target = (
        await sql<ProfileRow>`select * from profiles where user_id=${data.userId}`
      )[0];
      if (!target || target.merged_into_user_id) throw new Error("Cuenta no disponible.");
      if (
        data.role === "oficina" &&
        (await sql`select id from producers where owner_user_id=${data.userId} limit 1`).length
      )
        throw new Error("Reasigna su cartera antes de convertir este acceso en Oficina.");
      if (data.role === "comisionista") {
        const foreignAttention =
          await sql`select id from producers where attention_user_id=${data.userId} and owner_user_id is distinct from ${data.userId} limit 1`;
        const foreignTasks =
          await sql`select t.id from producer_tasks t join producers p on p.id=t.producer_id where t.assignee_id=${data.userId} and t.status in ('pendiente','esperando') and p.owner_user_id is distinct from ${data.userId} limit 1`;
        if (foreignAttention.length || foreignTasks.length)
          throw new Error(
            "Reasigna su atención y tareas de otras carteras antes de convertir el acceso en comisionista.",
          );
      }
      await sql`update profiles set role=${data.role},access_admin=case when ${data.role}='gerente' then access_admin else false end,office_owner_ids='{}' where user_id=${data.userId}`;
      await writeAudit(
        sql,
        me,
        "cuenta",
        data.userId,
        "rol",
        { role: target.role },
        { role: data.role },
      );
      return { ok: true as const };
    });
  });

export const listProducers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(
    (
      d:
        | {
            stage?: string;
            q?: string;
            mine?: boolean;
            crop?: string;
            zone?: string;
            agent?: string;
            relation?: string;
          }
        | undefined,
    ) => d ?? {},
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const profile = await requireProfile(sql, context.userId, true);
    const producers = await listProducersRows(sql, profile, data);
    return { profile, producers };
  });

export const getProducer = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: { id: string }) => d)
  .handler(async ({ context, data }): Promise<ProducerDetail & { profile: Profile }> => {
    const sql = await getSql();
    const profile = await requireProfile(sql, context.userId, true);
    const producer = await assertCanEdit(sql, profile, data.id, true);
    const people = await sql<{
      user_id: string;
      display_name: string;
    }>`select user_id,display_name from profiles where user_id=any(${[producer.attentionUserId, producer.capturedBy].filter(Boolean)})`;
    producer.attentionName =
      people.find((p) => p.user_id === producer.attentionUserId)?.display_name ?? null;
    producer.capturedName =
      people.find((p) => p.user_id === producer.capturedBy)?.display_name ?? null;

    const docRows = await sql<ProducerRow>`
      select * from documents where producer_id = ${producer.id} order by doc_type
    `;
    const documents = visibleDocuments(docRows, producer.scheme, producer.id);
    const visitRows = await sql<ProducerRow>`
      select v.*, p.name as producer_name, p.phone, p.zone
      from visits v
      join producers p on p.id = v.producer_id
      where v.producer_id = ${producer.id}
      order by v.scheduled_at desc
    `;
    const actRows = await sql<ProducerRow>`
      select a.*,coalesce(p.display_name,u.name,'Cuenta anterior') as actor_name
      from activity a left join profiles p on p.user_id=a.user_id left join "user" u on u.id=a.user_id
      where a.producer_id=${producer.id} order by a.created_at desc,a.id desc limit 200
    `;
    const activity: ActivityItem[] = actRows.map((r) => ({
      id: String(r.id),
      producerId: String(r.producer_id),
      userId: String(r.user_id),
      actorName: String(r.actor_name),
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
    const group = await loadGroup(sql, producer.groupId, profile);
    const roster: GroupMember[] = [];
    if (group) {
      for (const m of group.producers) {
        const drows = await sql<ProducerRow>`select * from documents where producer_id = ${m.id}`;
        roster.push({
          producer: m,
          progress: progressOf(visibleDocuments(drows, m.scheme, m.id)),
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
  .validator((d: ProducerInput) => producerInputSchema.parse(d))
  .handler(async ({ context, data }) => {
    return (await getSql()).transaction(async (sql) => {
      const profile = await requireProfile(sql, context.userId, true);
      const kind =
        data.portfolioKind ?? (profile.role === "oficina" ? "pendiente" : "comisionista");
      if (profile.role === "comisionista" && kind !== "comisionista")
        throw new Error("Oficina o Gerencia registran la cartera de empresa.");
      const owner =
        kind === "comisionista"
          ? await resolveOwner(sql, profile, data.ownerUserId)
          : {
              userId: null,
              displayName: kind === "empresa" ? "Cartera de empresa" : "Pendiente de asignar",
            };
      const attentionId = data.attentionUserId || owner.userId || profile.userId;
      await resolveAttention(sql, profile, attentionId, kind, owner.userId);
      const intake = data.intakeChannel ?? (profile.role === "comisionista" ? "campo" : "oficina");
      if (data.stage === "cerrado")
        throw new Error("Guarda la ficha y registra el resultado del cierre desde Seguimiento.");
      await assertStageChange(sql, profile, data.stage);
      const name = data.name.trim();
      if (!name) throw new Error("Escribe el nombre del productor.");
      const hectares = Math.max(0, num(data.hectares));
      const yieldTonHa = Math.max(0, num(data.yieldTonHa));
      const volume = volumeOf(hectares, yieldTonHa);
      let perHa = Math.max(0, num(data.financingPerHa));
      if (data.scheme !== "financiamiento") perHa = 0;
      else if (!perHa)
        perHa = hectares
          ? Math.round(num(data.financingMxn) / hectares)
          : suggestedPerHa(data.crop);
      const financing = data.scheme === "financiamiento" ? loanOf(hectares, perHa) : 0;
      const id = newId("prd");
      const comisionistaName = owner.displayName;
      const relation = parseRelation(data.relation, data.isNew);
      const isNew = relation === "nuevo";
      await assertNoDuplicate(
        sql,
        { ...profile, userId: owner.userId ?? "" },
        {
          name,
          zone: data.zone,
          phone: data.phone,
          comisionistaName,
          groupId: data.groupId,
          newGroupName: data.newGroupName,
        },
      );
      await sql`
      insert into producers (
        id, owner_user_id, comisionista_name, name, business_unit, scheme, is_new, relation,
        zone, locality, crop, hectares, yield_ton_ha, volume_ton, financing_mxn, financing_per_ha,
        phone, email, stage, blocker, notes, cycle, hectares_requested,portfolio_kind,attention_user_id,captured_by,intake_channel
      ) values (
        ${id}, ${owner.userId}, ${comisionistaName}, ${name}, ${data.businessUnit},
        ${data.scheme}, ${isNew}, ${relation}, ${data.zone}, ${data.locality?.trim() || null},
        ${data.crop}, ${hectares}, ${yieldTonHa}, ${volume}, ${financing}, ${perHa},
        ${data.phone?.trim() || null}, ${data.email?.trim() || null}, ${data.stage}, ${data.blocker?.trim() || null},
        ${data.notes?.trim() || null}, ${CYCLE}, ${hectares},${kind},${attentionId},${profile.userId},${intake}
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
  });

export const updateProducer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: ProducerInput & { id: string }) => ({ ...producerInputSchema.parse(d), id: d.id }))
  .handler(async ({ context, data }) => {
    return (await getSql()).transaction(async (sql) => {
      const profile = await requireProfile(sql, context.userId, true);
      const prev = await assertCanEdit(sql, profile, data.id);
      if (data.stage === "cerrado" && prev.stage !== "cerrado")
        throw new Error("Registra el cierre y su resultado desde Seguimiento.");
      if (
        (data.portfolioKind && data.portfolioKind !== prev.portfolioKind) ||
        (data.attentionUserId && data.attentionUserId !== prev.attentionUserId)
      )
        throw new Error("Cambia la cartera o la atención desde Asignación, con su motivo.");
      const owner = await resolveOwner(sql, profile, data.ownerUserId, prev);
      const economicChange =
        data.hectares !== prev.hectares ||
        data.financingPerHa !== prev.financingPerHa ||
        data.scheme !== prev.scheme ||
        data.yieldTonHa !== prev.yieldTonHa;
      if (prev.rejectionKind && (data.hectares !== prev.hectares || data.scheme !== prev.scheme))
        throw new Error("Revisa el dictamen antes de cambiar superficie o esquema.");
      if (economicChange && needsApproval(prev.stage))
        throw new Error("Primero devuelve la ficha a evaluación para revisar sus montos.");
      await assertStageChange(sql, profile, data.stage, { ...prev, scheme: data.scheme });
      if ((owner.userId ?? "") !== prev.ownerUserId && prev.groupId) {
        if (data.groupId !== prev.groupId || data.newGroupName)
          throw new Error("Cambia el grupo y el responsable en operaciones separadas.");
        await sql`update producer_groups set owner_user_id = ${owner.userId}, comisionista_name = ${owner.displayName}, updated_at = now() where id = ${prev.groupId}`;
        const members = await sql<{
          id: string;
        }>`select id from producers where group_id = ${prev.groupId}`;
        for (const m of members) {
          await sql`update producers set owner_user_id = ${owner.userId}, comisionista_name = ${owner.displayName}, updated_at = now() where id = ${m.id}`;
          await sql`update visits set owner_user_id = ${owner.userId} where producer_id = ${m.id}`;
          await logActivity(
            sql,
            m.id,
            profile.userId,
            "responsable",
            `Cartera del grupo asignada a ${owner.displayName}.`,
          );
        }
      }
      const name = data.name.trim();
      if (!name) throw new Error("Escribe el nombre del productor.");
      const hectares = Math.max(0, num(data.hectares));
      const yieldTonHa = Math.max(0, num(data.yieldTonHa));
      const volume = volumeOf(hectares, yieldTonHa);
      let perHa = Math.max(0, num(data.financingPerHa));
      if (data.scheme !== "financiamiento") perHa = 0;
      else if (!perHa)
        perHa = hectares
          ? Math.round(num(data.financingMxn) / hectares)
          : suggestedPerHa(data.crop);
      const financing = data.scheme === "financiamiento" ? loanOf(hectares, perHa) : 0;
      const schemeChanged = prev.scheme !== data.scheme;
      const relation = parseRelation(data.relation, data.isNew);
      const isNew = relation === "nuevo";
      const comisionistaName = owner.displayName;
      await assertNoDuplicate(
        sql,
        { ...profile, userId: owner.userId ?? "" },
        {
          id: prev.id,
          name,
          zone: data.zone,
          phone: data.phone,
          comisionistaName,
          groupId: data.groupId,
          newGroupName: data.newGroupName,
        },
      );
      await sql`
      update producers set
        owner_user_id = ${owner.userId},
        hectares_requested = ${prev.rejectionKind ? prev.hectaresRequested : hectares},
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
        close_kind = ${data.stage === "cerrado" ? prev.closeKind : null},
        close_reason = ${data.stage === "cerrado" ? prev.closeReason : null},
        blocker = ${data.blocker?.trim() || null},
        notes = ${data.notes?.trim() || null},
        updated_at = now()
      where id = ${prev.id}
    `;
      if ((owner.userId ?? "") !== prev.ownerUserId && !prev.groupId) {
        await sql`update visits set owner_user_id = ${owner.userId} where producer_id = ${prev.id}`;
        await logActivity(
          sql,
          prev.id,
          profile.userId,
          "responsable",
          `Responsable: ${prev.comisionistaName} → ${owner.displayName}.`,
        );
      }
      const fieldChanges = [
        ["Nombre", prev.name, name],
        ["Teléfono", prev.phone, data.phone?.trim() || null],
        ["Correo", prev.email, data.email?.trim() || null],
        ["Municipio", prev.zone, data.zone],
        ["Localidad", prev.locality, data.locality?.trim() || null],
        ["Cultivo", prev.crop, data.crop],
        ["Pendiente", prev.blocker, data.blocker?.trim() || null],
        ["Notas", prev.notes, data.notes?.trim() || null],
        ["Relación", prev.relation, relation],
        ["Unidad", prev.businessUnit, data.businessUnit],
      ].filter(([, before, after]) => before !== after);
      if (fieldChanges.length)
        await logActivity(
          sql,
          prev.id,
          profile.userId,
          "edicion",
          fieldChanges
            .map(
              ([label, before, after]) =>
                `${label}: ${before || "sin dato"} → ${after || "sin dato"}`,
            )
            .join("; "),
        );
      if (economicChange)
        await logActivity(
          sql,
          prev.id,
          profile.userId,
          "edicion",
          `Superficie ${prev.hectares} → ${hectares} ha; monto por ha ${prev.financingPerHa} → ${perHa}; esquema ${prev.scheme} → ${data.scheme}.`,
        );
      await attachToGroup(sql, profile, prev.id, {
        groupId: data.groupId,
        newGroupName: data.newGroupName,
        groupRole: data.groupRole ?? prev.groupRole,
        comisionistaName,
        phone: data.phone,
      });
      await insertDocSet(sql, prev.id, data.scheme);
      if (schemeChanged) {
        await logActivity(
          sql,
          prev.id,
          profile.userId,
          "esquema",
          `Cambió el esquema a ${data.scheme}.`,
        );
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
  });

export const setStage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: string; stage: StageId; closeKind?: string; reason?: string }) => d)
  .handler(async ({ context, data }) => {
    return (await getSql()).transaction(async (sql) => {
      const profile = await requireProfile(sql, context.userId, true);
      const prev = await assertCanEdit(sql, profile, data.id);
      if (data.stage === "cerrado" && prev.stage !== "cerrado" && !("closeKind" in data))
        throw new Error("Registra el cierre y su resultado desde Seguimiento.");
      await assertStageChange(sql, profile, data.stage, prev);
      const reason = data.stage === "cerrado" ? requiredReason(data.reason) : null;
      if (
        data.stage === "cerrado" &&
        !["ganado", "perdido", "cancelado"].includes(data.closeKind ?? "")
      )
        throw new Error("Indica si se concretó, se perdió o se canceló el trato.");
      await sql`update producers set stage=${data.stage},close_kind=${data.stage === "cerrado" ? data.closeKind : null},close_reason=${reason},updated_at=now() where id=${prev.id}`;
      await writeAudit(
        sql,
        profile,
        "productor",
        prev.id,
        "etapa",
        { stage: prev.stage, closeKind: prev.closeKind, reason: prev.closeReason },
        { stage: data.stage, closeKind: data.closeKind ?? null, reason },
      );
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
  });

/** Compatibility endpoint: never erase a real producer or its history. */
export const deleteProducer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: string; reason?: string }) => d)
  .handler(async ({ context, data }) =>
    (await getSql()).transaction(async (sql) => {
      const me = await requireProfile(sql, context.userId, true);
      const p = await assertCanEdit(sql, me, data.id);
      if (needsApproval(p.stage) && me.role !== "gerente")
        throw new Error("Pide a gerencia archivar una ficha habilitada o en acopio.");
      const reason = requiredReason(data.reason);
      await sql`update producers set archived_at=now(),archived_by=${me.userId},archive_reason=${reason},updated_at=now() where id=${p.id}`;
      await writeAudit(sql, me, "productor", p.id, "archivar", { stage: p.stage }, { reason });
      await logActivity(
        sql,
        p.id,
        me.userId,
        "archivo",
        `Ficha archivada: ${reason}. Se conserva el expediente.`,
      );
      return { ok: true as const };
    }),
  );

export const restoreProducer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: string; reason: string }) => d)
  .handler(async ({ context, data }) =>
    (await getSql()).transaction(async (sql) => {
      const me = await requireProfile(sql, context.userId);
      if (me.role !== "gerente") throw new Error("Solo gerencia puede restaurar fichas.");
      const p = await assertCanEdit(sql, me, data.id, true);
      if (!p.archivedAt) throw new Error("Esta ficha ya está activa.");
      const reason = requiredReason(data.reason);
      await sql`update producers set archived_at=null,archived_by=null,archive_reason=null,updated_at=now() where id=${p.id}`;
      await writeAudit(
        sql,
        me,
        "productor",
        p.id,
        "restaurar",
        { archivedAt: p.archivedAt, reason: p.archiveReason },
        { reason },
      );
      await logActivity(sql, p.id, me.userId, "archivo", `Ficha restaurada: ${reason}.`);
      return { ok: true as const };
    }),
  );

export const listArchivedProducers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const me = await requireProfile(sql, context.userId, true);
    const rows =
      await sql<ProducerRow>`select * from producers where archived_at is not null and cycle=${CYCLE} and (${me.role !== "comisionista"} or owner_user_id=${me.userId}) order by archived_at desc`;
    return { items: rows.map(mapProducer) };
  });

function requiredReason(value?: string | null) {
  const text = value?.trim() ?? "";
  if (text.length < 5 || text.length > 1000)
    throw new Error("Explica el motivo o resultado (5 a 1,000 caracteres).");
  return text;
}

export const listDuplicateGroups = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const me = await requireProfile(sql, context.userId);
    if (me.role !== "gerente") return { groups: [] as { reason: string; producers: Producer[] }[] };
    const rows =
      await sql<ProducerRow>`select * from producers where archived_at is null and cycle = ${CYCLE} order by name`;
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
  if (status === "entregado") return 1.5;
  if (status === "no_hizo") return 1;
  return 0;
}

async function mergeProducerInto(sql: Sql, keep: Producer, drop: Producer, userId: string) {
  if (
    keep.groupId !== drop.groupId ||
    keep.ownerUserId !== drop.ownerUserId ||
    keep.portfolioKind !== drop.portfolioKind
  )
    throw new Error(
      "Antes de fusionar, ambas fichas deben pertenecer al mismo responsable y grupo.",
    );
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

  await sql`update producer_tasks set legacy_primary=false where producer_id=${drop.id}`;
  await sql`update producer_tasks set producer_id=${keep.id} where producer_id=${drop.id}`;
  await sql`update producer_communications set producer_id=${keep.id} where producer_id=${drop.id}`;
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
  await repairGroup(sql, keep.groupId);
}

export const resolveDuplicate = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { keepId: string; dropIds: string[] }) => d)
  .handler(async ({ context, data }) => {
    return (await getSql()).transaction(async (sql) => {
      const me = await requireProfile(sql, context.userId);
      if (me.role !== "gerente") throw new Error("Solo gerencia puede juntar o borrar duplicados.");
      const keepRows =
        await sql<ProducerRow>`select * from producers where id = ${data.keepId} limit 1`;
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
  });

export const listGroups = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: { agent?: string } | undefined) => d ?? {})
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const profile = await requireProfile(sql, context.userId, true);
    const { mine, agent } = agentScope(profile, data.agent);
    const rows = await sql<{ id: string }>`
      select id from producer_groups
      where cycle = ${CYCLE}
        and (${mine} = false or owner_user_id = ${profile.userId})
        and (${agent} = '' or (comisionista_name = ${agent} or owner_user_id = ${agent.startsWith("uid:") ? agent.slice(4) : ""}))
      order by name
    `;
    const groups: ProducerGroup[] = [];
    for (const r of rows) {
      const g = await loadGroup(sql, String(r.id), profile);
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
    return (await getSql()).transaction(async (sql) => {
      const me = await requireProfile(sql, context.userId, true);
      const ids = [...new Set(data.producerIds.filter(Boolean))];
      if (ids.length < 2) throw new Error("Se necesitan al menos dos nombres para armar el grupo.");
      const name = data.name.trim();
      if (!name) throw new Error("Ponle nombre al grupo. Ej. Grupo Ramírez.");
      const members: Producer[] = [];
      for (const id of ids) {
        members.push(await assertCanEdit(sql, me, id));
      }
      const agents = new Set(members.map((p) => `${p.portfolioKind}:${p.ownerUserId}`));
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
      insert into producer_groups (id, name, owner_user_id, comisionista_name, titular_producer_id, cycle,portfolio_kind)
      values (${gid}, ${name}, ${titularFull.ownerUserId || null}, ${titularFull.comisionistaName}, ${titularFull.id}, ${CYCLE},${titularFull.portfolioKind ?? "comisionista"})
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
      // Check the final membership, so a shared phone cannot be split across groups.
      for (const p of members)
        await assertNoDuplicate(sql, { ...me, userId: p.ownerUserId }, { ...p, groupId: gid });
      await repairGroup(sql, gid);
      for (const old of new Set(members.map((p) => p.groupId))) await repairGroup(sql, old);
      return { id: gid };
    });
  });

export const setDocumentStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: string; status: DocStatus; reason?: string }) => d)
  .handler(async ({ context, data }) => {
    return (await getSql()).transaction(async (sql) => {
      const profile = await requireProfile(sql, context.userId, true);
      const rows = await sql<ProducerRow>`
      select d.*, p.owner_user_id, p.scheme, p.stage, p.id as producer_id, p.name as producer_name
      from documents d
      join producers p on p.id = d.producer_id
      where d.id = ${data.id}
      limit 1
    `;
      const row = rows[0];
      if (!row) throw new Error("Documento no encontrado.");
      if (profile.role === "comisionista" && String(row.owner_user_id) !== profile.userId) {
        throw new Error("Este productor lo lleva otro comisionista.");
      }
      if (!DOC_STATUS.some((s) => s.id === data.status))
        throw new Error("Estado de documento no válido.");
      if (!docsForScheme(String(row.scheme)).some((d) => d.id === row.doc_type))
        throw new Error(
          "Este documento pertenece al esquema anterior y se conserva como historial.",
        );
      if (
        (profile.role === "comisionista" &&
          [data.status, String(row.status)].some((s) =>
            ["validado", "no_aplica", "entregado"].includes(s),
          )) ||
        (profile.role === "oficina" && [data.status, String(row.status)].includes("no_aplica"))
      )
        throw new Error(
          "Solo gerencia autoriza excepciones; Oficina también puede recibir y validar documentos.",
        );
      const required = docsForScheme(String(row.scheme)).find(
        (d) => d.id === row.doc_type,
      )?.required;
      if (
        required &&
        needsApproval(String(row.stage)) &&
        !["validado", "no_aplica"].includes(data.status)
      ) {
        throw new Error(
          "Primero regresa la ficha a evaluación para cambiar un documento obligatorio de una habilitación o acopio autorizado.",
        );
      }
      if (profile.role === "oficina") await assertOfficeFile(sql, profile, String(row.producer_id));
      else await assertCanEdit(sql, profile, String(row.producer_id));
      const reason =
        data.status === "no_aplica" ? requiredReason(data.reason) : data.reason?.trim() || null;
      await sql`update documents set status=${data.status},notes=coalesce(${reason},notes),updated_at=now() where id=${data.id}`;
      await writeAudit(
        sql,
        profile,
        "documento",
        data.id,
        "estado",
        { status: row.status, notes: row.notes },
        { status: data.status, reason },
      );
      await sql`update producers set updated_at = now() where id = ${String(row.producer_id)}`;
      await logActivity(
        sql,
        String(row.producer_id),
        profile.userId,
        "papel",
        `${docLabel(String(row.scheme), String(row.doc_type))}: ${data.status}${reason ? ` · ${reason}` : ""}.`,
      );
      return { ok: true as const };
    });
  });

export const createVisit = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (d: {
      producerId: string;
      scheduledAt: string;
      place?: string | null;
      purpose?: string | null;
      notes?: string | null;
    }) => d,
  )
  .handler(async ({ context, data }) => {
    return (await getSql()).transaction(async (sql) => {
      const profile = await requireProfile(sql, context.userId, true);
      const producer = await assertCanEdit(sql, profile, data.producerId);
      const when = parseLocalDateTime(data.scheduledAt);
      if (Number.isNaN(when.getTime())) throw new Error("La fecha de la cita no es válida.");
      const id = newId("vis");
      await sql`
      insert into visits (id, producer_id, owner_user_id, scheduled_at, place, purpose, notes)
      values (
        ${id}, ${producer.id}, ${producer.ownerUserId || null}, ${when.toISOString()},
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
    return (await getSql()).transaction(async (sql) => {
      const profile = await requireProfile(sql, context.userId, true);
      const producer = await assertCanEdit(sql, profile, data.producerId);
      const channel = data.channel.trim() || "nota";
      if (!["llamada", "whatsapp", "mensaje", "correo", "visita", "nota"].includes(channel))
        throw new Error("Tipo de contacto no válido.");
      if (!data.outcome?.trim() && !data.summary?.trim())
        throw new Error("Registra qué pasó en el contacto.");
      const when = data.happenedAt ? new Date(data.happenedAt) : new Date();
      const id = newId("tch");
      await sql`
      insert into touches (id, producer_id, owner_user_id, channel, outcome, summary, happened_at)
      values (
        ${id}, ${producer.id}, ${profile.userId}, ${channel},
        ${data.outcome?.trim() || null}, ${data.summary?.trim() || null}, ${when.toISOString()}
      )
    `;
      if (channel !== "nota")
        await sql`
      update producers
      set last_touch_at = greatest(last_touch_at, ${when.toISOString()}::timestamptz),
          last_touch_channel = case when last_touch_at is null or last_touch_at <= ${when.toISOString()}::timestamptz then ${channel} else last_touch_channel end,
          updated_at = now()
      where id = ${producer.id}
    `;
      const bits = [channelLabel(channel), outcomeLabel(data.outcome), data.summary?.trim()].filter(
        Boolean,
      );
      await logActivity(sql, producer.id, profile.userId, "contacto", bits.join(" · "));
      return { id };
    });
  });

export const setVisitStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: string; status: Visit["status"]; notes?: string | null }) => d)
  .handler(async ({ context, data }) => {
    return (await getSql()).transaction(async (sql) => {
      const profile = await requireProfile(sql, context.userId, true);
      const rows = await sql<ProducerRow>`
      select v.*, p.owner_user_id, p.id as producer_id, p.name as producer_name
      from visits v join producers p on p.id = v.producer_id
      where v.id = ${data.id} limit 1
    `;
      const row = rows[0];
      if (!row) throw new Error("Cita no encontrada.");
      if (profile.role === "comisionista" && String(row.owner_user_id) !== profile.userId) {
        throw new Error("Esta cita es de otro comisionista.");
      }
      if (!VISIT_STATUS.some((s) => s.id === data.status))
        throw new Error("Estado de cita no válido.");
      await assertCanEdit(sql, profile, String(row.producer_id));
      const result =
        data.status === "cumplida" && String(row.status) !== "cumplida"
          ? requiredReason(data.notes)
          : data.notes?.trim() || null;
      if (data.status === "cumplida" && String(row.status) !== "cumplida") {
        const when = new Date().toISOString();
        await sql`insert into touches(id,producer_id,owner_user_id,channel,outcome,summary,happened_at,visit_id)
          values(${newId("tch")},${String(row.producer_id)},${profile.userId},'visita','contesto',${result},${when},${data.id})
          on conflict (visit_id) where visit_id is not null do nothing`;
        await sql`update visits set outcome=${result},completed_at=coalesce(completed_at,${when}::timestamptz) where id=${data.id}`;
        await sql`update producers set last_touch_at=(select max(happened_at) from touches where producer_id=${String(row.producer_id)} and channel<>'nota'),last_touch_channel=(select channel from touches where producer_id=${String(row.producer_id)} and channel<>'nota' order by happened_at desc limit 1) where id=${String(row.producer_id)}`;
      }
      await sql`
      update visits
      set status = ${data.status}, notes = coalesce(${result}, notes)
      where id = ${data.id}
    `;
      if (String(row.status) !== data.status)
        await sql`update producer_tasks set status=${data.status === "programada" ? "pendiente" : data.status === "cumplida" ? "atendida" : "cancelada"},result=${result || data.status},completed_at=${data.status === "programada" ? null : new Date().toISOString()},version=${newId("task")},updated_at=now() where visit_id=${data.id}`;
      if (
        String(row.status) !== data.status ||
        (data.notes !== undefined && data.notes !== row.notes)
      ) {
        await logActivity(
          sql,
          String(row.producer_id),
          profile.userId,
          "cita",
          `Cita ${formatAppDateTime(iso(row.scheduled_at))}: ${String(row.status)} → ${data.status}${data.notes ? ` · ${data.notes}` : ""}.`,
        );
        await writeAudit(
          sql,
          profile,
          "cita",
          data.id,
          "estado",
          { status: row.status, notes: row.notes },
          { status: data.status, notes: data.notes ?? row.notes },
        );
      }
      return { ok: true as const };
    });
  });

export const listVisits = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(
    (
      d: ({ range?: "hoy" | "semana" | "todas"; agent?: string } & PeriodSelection) | undefined,
    ) => ({ ...d, ...periodSchema.parse(d ?? {}) }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const profile = await requireProfile(sql, context.userId, true);
    const { mine, agent } = agentScope(profile, data.agent);
    const range = data.range ?? "semana";
    const dates = data.period ? periodRange(data) : null;
    const rows = await sql<ProducerRow>`
      select v.*, p.name as producer_name, p.phone, p.zone
      from visits v
      join producers p on p.id = v.producer_id
      where p.cycle=${CYCLE} and not p.is_example and p.archived_at is null and (${mine} = false or p.owner_user_id = ${profile.userId})
        and (${agent} = '' or (p.comisionista_name = ${agent} or p.owner_user_id = ${agent.startsWith("uid:") ? agent.slice(4) : ""}))
      and (${dates?.start ?? null}::timestamptz is null or (v.scheduled_at>=${dates?.start ?? null}::timestamptz and v.scheduled_at<${dates?.end ?? null}::timestamptz))
      order by v.scheduled_at asc
    `;
    let visits = rows.map(mapVisit);
    if (!dates && range === "hoy") visits = visits.filter((v) => isAppToday(v.scheduledAt));
    if (!dates && range === "semana") visits = visits.filter((v) => isAppThisWeek(v.scheduledAt));
    return { profile, visits };
  });

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: { agent?: string } | undefined) => d ?? {})
  .handler(async ({ context, data }): Promise<Dashboard> => {
    const sql = await getSql();
    const profile = await requireProfile(sql, context.userId, true);
    const { mine, agent } = agentScope(profile, data.agent);
    const list = await listProducersRows(sql, profile, { agent: data.agent });
    const live = list.filter((p) => p.rejectionKind !== "total" && p.stage !== "cerrado");

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
      const cur = agentMap.get(`${p.portfolioKind}:${p.ownerUserId}`) ?? {
        name: p.comisionistaName,
        userId: p.ownerUserId,
        count: 0,
        hectares: 0,
        volume: 0,
        financing: 0,
      };
      cur.count += 1;
      cur.hectares += p.hectares;
      cur.volume += p.volumeTon;
      cur.financing += p.financingMxn;
      agentMap.set(`${p.portfolioKind}:${p.ownerUserId}`, cur);
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
      where d.status in ('pendiente', 'no_hizo')
        and (p.scheme || ':' || d.doc_type) = any(${activeDocumentKeys})
        and p.archived_at is null and p.cycle = ${CYCLE}
        and (${mine} = false or p.owner_user_id = ${profile.userId})
        and (${agent} = '' or (p.comisionista_name = ${agent} or p.owner_user_id = ${agent.startsWith("uid:") ? agent.slice(4) : ""}))
    `;
    kpis.pendingDocs = num(pending[0]?.n);

    const todayRows = await sql<ProducerRow>`
      select v.*, p.name as producer_name, p.phone, p.zone
      from visits v
      join producers p on p.id = v.producer_id
      where p.archived_at is null and v.status = 'programada'
        and v.scheduled_at >= now() - interval '1 day'
        and v.scheduled_at < now() + interval '2 days'
        and (${mine} = false or p.owner_user_id = ${profile.userId})
        and (${agent} = '' or (p.comisionista_name = ${agent} or p.owner_user_id = ${agent.startsWith("uid:") ? agent.slice(4) : ""}))
      order by v.scheduled_at asc
    `;
    const todayVisits = todayRows.map(mapVisit).filter((v) => isAppToday(v.scheduledAt));
    kpis.visitsToday = todayVisits.length;

    const upcomingRows = await sql<ProducerRow>`
      select v.*, p.name as producer_name, p.phone, p.zone
      from visits v
      join producers p on p.id = v.producer_id
      where p.archived_at is null and v.status = 'programada'
        and v.scheduled_at > now()
        and (${mine} = false or p.owner_user_id = ${profile.userId})
        and (${agent} = '' or (p.comisionista_name = ${agent} or p.owner_user_id = ${agent.startsWith("uid:") ? agent.slice(4) : ""}))
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
             count(*) filter (where d.status in ('pendiente', 'no_hizo')
        and (p.scheme || ':' || d.doc_type) = any(${activeDocumentKeys}))::int as faltan
      from producers p
      join documents d on d.producer_id = p.id
        and (p.scheme || ':' || d.doc_type) = any(${activeDocumentKeys})
      where p.archived_at is null and p.cycle = ${CYCLE}
        and p.stage in ('interesado', 'papeleria', 'evaluacion')
        and (${mine} = false or p.owner_user_id = ${profile.userId})
        and (${agent} = '' or (p.comisionista_name = ${agent} or p.owner_user_id = ${agent.startsWith("uid:") ? agent.slice(4) : ""}))
      group by p.id, p.name, p.blocker
      having count(*) filter (where d.status in ('pendiente', 'no_hizo')
        and (p.scheme || ':' || d.doc_type) = any(${activeDocumentKeys})) > 0
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
      const age = Date.now() - new Date(p.stageEnteredAt ?? p.createdAt).getTime();
      return age > 1000 * 60 * 60 * 24 * 3;
    });
    for (const p of stuck.slice(0, 4)) {
      attention.push({
        id: `stuck-${p.id}`,
        kind: "estancado",
        title: p.name,
        detail: `Sin avance de etapa registrado por más de 3 días: ${stageMeta(p.stage).label.toLowerCase()}`,
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
    p.rejectionKind === "total"
      ? "Rechazo total"
      : p.rejectionKind === "parcial"
        ? "Rechazo parcial"
        : "",
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
    const profile = await requireProfile(sql, context.userId, true);
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
    const profile = await requireProfile(sql, context.userId, true);
    const producers = await listProducersRows(sql, profile, { agent: data.agent });
    const byAgent = new Map<string, Producer[]>();
    for (const p of producers) {
      const arr = byAgent.get(p.ownerUserId) ?? [];
      arr.push(p);
      byAgent.set(p.ownerUserId, arr);
    }
    const summaryRows = [...byAgent.entries()]
      .map(([userId, items]) => [
        items[0].comisionistaName + " · " + userId,
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
    const me = await requireProfile(sql, context.userId, true);
    const rows =
      me.role !== "comisionista"
        ? await sql<{
            id: string;
            name: string;
            email: string | null;
          }>`select distinct p.owner_user_id as id,p.comisionista_name as name,u.email from producers p left join "user" u on u.id=p.owner_user_id where p.archived_at is null and p.cycle=${CYCLE} order by p.comisionista_name`
        : [];
    return {
      names: rows.map((r) => r.name),
      agents: rows.map((r) => ({
        id: r.id ? "uid:" + r.id : r.name,
        name: r.name,
        label:
          rows.filter((x) => x.name === r.name).length > 1
            ? r.name + " · " + (r.email ?? r.id)
            : r.name,
      })),
    };
  });

export const getCartera = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const profile = await requireProfile(sql, context.userId, true);
    const producers = await listProducersRows(sql, profile, {});
    const map = new Map<string, Producer[]>();
    for (const p of producers) {
      const arr = map.get(`${p.portfolioKind}:${p.ownerUserId}`) ?? [];
      arr.push(p);
      map.set(`${p.portfolioKind}:${p.ownerUserId}`, arr);
    }
    const agents: AgentCartera[] = [...map.entries()]
      .map(([_key, items]) => ({
        name: items[0].comisionistaName,
        userId: items[0].ownerUserId,
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
    const profile = await requireProfile(sql, context.userId, true);
    const { mine, agent } = agentScope(profile, data.agent);
    const items: ReminderItem[] = [];

    const visitRows = await sql<ProducerRow>`
      select v.*, p.name as producer_name, p.phone, p.zone, p.comisionista_name
      from visits v
      join producers p on p.id = v.producer_id
      where p.archived_at is null and v.status = 'programada'
        and v.scheduled_at >= now() - interval '2 hours'
        and v.scheduled_at < now() + interval '2 days'
        and (${mine} = false or p.owner_user_id = ${profile.userId})
        and (${agent} = '' or (p.comisionista_name = ${agent} or p.owner_user_id = ${agent.startsWith("uid:") ? agent.slice(4) : ""}))
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
        and (p.scheme || ':' || d.doc_type) = any(${activeDocumentKeys})
      where p.archived_at is null and p.cycle = ${CYCLE}
        and d.status in ('pendiente', 'no_hizo')
        and p.stage in ('interesado', 'papeleria', 'evaluacion')
        and (${mine} = false or p.owner_user_id = ${profile.userId})
        and (${agent} = '' or (p.comisionista_name = ${agent} or p.owner_user_id = ${agent.startsWith("uid:") ? agent.slice(4) : ""}))
      order by p.name
    `;
    const paperMap = new Map<
      string,
      {
        id: string;
        name: string;
        phone: string | null;
        agentName: string;
        scheme: string;
        labels: string[];
      }
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
    for (const row of [...paperMap.values()]
      .sort((a, b) => b.labels.length - a.labels.length)
      .slice(0, 20)) {
      items.push({
        id: `paper-${row.id}`,
        kind: "papeleria",
        producerId: row.id,
        producerName: row.name,
        phone: row.phone,
        comisionistaName: row.agentName,
        title: row.name,
        detail: `Faltan ${row.labels.length}: ${row.labels.slice(0, 3).join(", ")}`,
        message: paperworkMessage({
          producerName: row.name,
          agentName: row.agentName,
          missing: row.labels,
        }),
      });
    }

    const list = await listProducersRows(sql, profile, { agent: agent || undefined });
    const stuck = list.filter((p) => {
      if (!["prospecto", "visita"].includes(p.stage)) return false;
      return (
        Date.now() - new Date(p.stageEnteredAt ?? p.createdAt).getTime() > 1000 * 60 * 60 * 24 * 3
      );
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
    visits: [
      { offsetHours: 4, purpose: "Primera visita", place: "Campo — ejido 27 de Septiembre" },
    ],
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
    notes:
      "Ya sembró. Urge papelería para liberar diésel. Se fue el ciclo pasado; lo estamos recuperando.",
    docs: {
      ine: "validado",
      curp: "recibido",
      rfc: "recibido",
      domicilio: "recibido",
      predio: "recibido",
    },
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
    docs: {
      ine: "validado",
      curp: "validado",
      rfc: "validado",
      solicitud: "recibido",
      garantia: "recibido",
    },
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
    visits: [
      { offsetHours: -20, purpose: "Cuadrar volumen", place: "Parcela 12", status: "cumplida" },
    ],
  },
];

export const loadExamples = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    return (await getSql()).transaction(async (sql) => {
      const profile = await requireProfile(sql, context.userId);
      if (process.env.VERCEL || profile.role !== "gerente")
        throw new Error("Los ejemplos solo se cargan en un entorno local de pruebas.");
      const existing = await sql<{ n: number }>`
      select count(*)::int as n from producers
      where archived_at is null and cycle = ${CYCLE} and owner_user_id = ${profile.userId}
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
        await logActivity(
          sql,
          id,
          profile.userId,
          "alta",
          `Se capturó a ${spec.name} (ejemplo ciclo ${CYCLE}).`,
        );
        loaded += 1;
      }
      return { loaded, already: false as const };
    });
  });

export const clearExamples = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    return (await getSql()).transaction(async (sql) => {
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
  });

export const purgeDemoData = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    return (await getSql()).transaction(async (sql) => {
      const me = await requireProfile(sql, context.userId);
      if (me.role !== "gerente") throw new Error("Solo gerencia puede quitar las pruebas.");
      const producers = await wipeDemoProducers(sql);
      const users = 0; // Account deletion is explicit in Equipo, never inferred from email.
      return { producers, users };
    });
  });

export const listPaperwork = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: { agent?: string; docType?: string } | undefined) => d ?? {})
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const profile = await requireProfile(sql, context.userId, true);
    const { mine, agent } = agentScope(profile, data.agent);
    const want = (data.docType ?? "").trim();
    const rows = await sql<ProducerRow>`
      select p.id, p.name, p.stage, p.phone, p.comisionista_name, p.scheme,
             p.zone, d.doc_type, d.status
      from producers p
      join documents d on d.producer_id = p.id
        and (p.scheme || ':' || d.doc_type) = any(${activeDocumentKeys})
      where p.archived_at is null and p.cycle = ${CYCLE}
        and (${mine} = false or p.owner_user_id = ${profile.userId})
        and (${agent} = '' or (p.comisionista_name = ${agent} or p.owner_user_id = ${agent.startsWith("uid:") ? agent.slice(4) : ""}))
        and coalesce(p.rejection_kind, '') <> 'total'
        and d.status in ('pendiente', 'no_hizo')
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
      if (!docsForScheme(scheme).some((d) => d.id === docType)) continue;
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
        label:
          items
            .find((i) => i.missing.some((d) => d.docType === docType))
            ?.missing.find((d) => d.docType === docType)?.label ??
          docLabel("financiamiento", docType),
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
    return (await getSql()).transaction(async (sql) => {
      const profile = await requireProfile(sql, context.userId);
      if (profile.role !== "gerente")
        throw new Error("Solo gerencia puede emitir o quitar dictámenes.");
      if (!["none", "total", "parcial"].includes(data.kind)) throw new Error("Dictamen no válido.");
      const prev = await assertCanEdit(sql, profile, data.id);
      if (data.kind === "none") {
        if (!prev.rejectionKind) return { ok: true as const };
        const ha = prev.hectaresRequested || prev.hectares;
        const volume = volumeOf(ha, prev.yieldTonHa);
        const financing =
          prev.scheme === "financiamiento" ? loanOf(ha, prev.financingPerHa) : prev.financingMxn;
        await sql`
        update producers set
          stage = 'evaluacion',
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
      const financing =
        prev.scheme === "financiamiento" ? loanOf(authorized, prev.financingPerHa) : 0;
      await sql`
      update producers set
        stage = 'evaluacion',
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
  });

function mapAnnouncement(r: ProducerRow): Announcement {
  const expiresAt = r.expires_at ? iso(r.expires_at) : null;
  return {
    id: String(r.id),
    authorUserId: String(r.author_user_id),
    authorName: String(r.author_name),
    kind: r.kind === "productores" ? "productores" : "equipo",
    stage: r.stage ? (String(r.stage) as StageId) : null,
    title: String(r.title),
    body: String(r.body),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    archivedAt: r.archived_at ? iso(r.archived_at) : null,
    expiresAt,
    state: r.archived_at
      ? "retirado"
      : expiresAt && Date.parse(expiresAt) <= Date.now()
        ? "vencido"
        : "vigente",
  };
}
function announcementValues(data: {
  kind: "equipo" | "productores";
  title?: string;
  body: string;
  stage?: string | null;
  expiresAt?: string | null;
}) {
  if (!["equipo", "productores"].includes(data.kind)) throw new Error("Tipo de aviso no válido.");
  const body = data.body?.trim(),
    title =
      data.title?.trim() || (data.kind === "equipo" ? "Aviso al equipo" : "Aviso a productores");
  if (!body || body.length > 10000 || title.length > 250)
    throw new Error("Escribe un título y un recado de hasta 10,000 caracteres.");
  if (data.stage && !STAGES.some((s) => s.id === data.stage)) throw new Error("Etapa no válida.");
  const expiry = data.expiresAt ? parseLocalDateTime(data.expiresAt) : null;
  if (expiry && Number.isNaN(expiry.getTime())) throw new Error("La vigencia no es válida.");
  return { body, title, expiresAt: expiry?.toISOString() ?? null };
}
export const listAnnouncements = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: { includeHistory?: boolean } | undefined) => d ?? {})
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await requireProfile(sql, context.userId, true);
    if (data.includeHistory && me.role !== "gerente")
      throw new Error("Solo gerencia puede ver los avisos retirados.");
    const rows = await sql<ProducerRow>`select * from announcements
      where (${Boolean(data.includeHistory)} or (archived_at is null and (expires_at is null or expires_at>now())))
      and kind='equipo' order by created_at desc,id desc limit 200`;
    return { items: rows.map(mapAnnouncement) };
  });
export const postAnnouncement = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (d: {
      kind: "equipo" | "productores";
      title?: string;
      body: string;
      stage?: string | null;
      expiresAt?: string | null;
    }) => d,
  )
  .handler(async ({ context, data }) =>
    (await getSql()).transaction(async (sql) => {
      const me = await requireProfile(sql, context.userId);
      if (me.role !== "gerente") throw new Error("Solo gerencia manda avisos.");
      const value = announcementValues(data),
        id = newId("anuncio");
      await sql`insert into announcements(id,author_user_id,author_name,kind,stage,title,body,expires_at) values
      (${id},${me.userId},${me.displayName},${data.kind},${data.kind === "productores" ? data.stage || null : null},${value.title},${value.body},${value.expiresAt})`;
      await writeAudit(
        sql,
        me,
        "aviso",
        id,
        data.kind === "equipo" ? "publicar" : "preparar",
        null,
        { ...value, kind: data.kind, stage: data.stage ?? null },
      );
      return { id };
    }),
  );
export const editAnnouncement = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (d: {
      id: string;
      title: string;
      body: string;
      expiresAt?: string | null;
      expectedUpdatedAt: string;
    }) => d,
  )
  .handler(async ({ context, data }) =>
    (await getSql()).transaction(async (sql) => {
      const me = await requireProfile(sql, context.userId);
      if (me.role !== "gerente") throw new Error("Solo gerencia edita avisos.");
      const rows = await sql<ProducerRow>`select * from announcements where id=${data.id}`;
      const row = rows[0];
      if (!row) throw new Error("Aviso no encontrado.");
      if (row.archived_at) throw new Error("Restaura el aviso antes de editarlo.");
      if (iso(row.updated_at) !== data.expectedUpdatedAt)
        throw new Error("Otra persona cambió este aviso. Actualiza antes de guardar.");
      const value = announcementValues({ ...data, kind: row.kind as "equipo" | "productores" });
      await sql`update announcements set title=${value.title},body=${value.body},expires_at=${value.expiresAt},updated_at=now() where id=${data.id}`;
      await writeAudit(sql, me, "aviso", data.id, "editar", mapAnnouncement(row), value);
      return { ok: true };
    }),
  );
export const archiveAnnouncement = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: string; archive: boolean }) => d)
  .handler(async ({ context, data }) =>
    (await getSql()).transaction(async (sql) => {
      const me = await requireProfile(sql, context.userId);
      if (me.role !== "gerente") throw new Error("Solo gerencia retira o restaura avisos.");
      if (typeof data.archive !== "boolean") throw new Error("Acción no válida.");
      const rows = await sql<ProducerRow>`select * from announcements where id=${data.id}`;
      const row = rows[0];
      if (!row) throw new Error("Aviso no encontrado.");
      if (Boolean(row.archived_at) === data.archive) return { ok: true };
      await sql`update announcements set archived_at=case when ${data.archive} then now() else null end,updated_at=now() where id=${data.id}`;
      await writeAudit(
        sql,
        me,
        "aviso",
        data.id,
        data.archive ? "retirar" : "restaurar",
        mapAnnouncement(row),
        { archived: data.archive },
      );
      return { ok: true };
    }),
  );
export const getAnnouncementHistory = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await requireProfile(sql, context.userId);
    if (me.role !== "gerente") throw new Error("Solo gerencia ve el historial de avisos.");
    const rows =
      await sql<ProducerRow>`select * from crm_audit where entity_type='aviso' and entity_id=${data.id} order by created_at desc,id desc limit 100`;
    return {
      items: rows.map((r) => ({
        id: String(r.id),
        action: String(r.action),
        actor: String(r.actor_name),
        at: iso(r.created_at),
        beforeTitle: String((r.before_data as Record<string, unknown> | null)?.title ?? ""),
        beforeBody: String((r.before_data as Record<string, unknown> | null)?.body ?? ""),
        afterTitle: String((r.after_data as Record<string, unknown> | null)?.title ?? ""),
        afterBody: String((r.after_data as Record<string, unknown> | null)?.body ?? ""),
      })),
    };
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
    await requireProfile(sql, context.userId, true);
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
    return (await getSql()).transaction(async (sql) => {
      const me = await requireProfile(sql, context.userId);
      if (me.role !== "gerente")
        throw new Error("Solo gerencia puede cargar a la gente de oficina.");
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
  });

export const deleteOfficePerson = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    return (await getSql()).transaction(async (sql) => {
      const me = await requireProfile(sql, context.userId);
      if (me.role !== "gerente")
        throw new Error("Solo gerencia puede borrar a alguien de oficina.");
      await sql`delete from office_people where id = ${data.id}`;
      return { ok: true as const };
    });
  });

export const pingOffice = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (d: { personId: string; kind: "invite" | "aviso"; producerId?: string; visitId?: string }) => d,
  )
  .handler(async ({ context, data }) => {
    return (await getSql()).transaction(async (sql) => {
      const profile = await requireProfile(sql, context.userId, true);
      const people = await sql<Record<string, unknown>>`
      select * from office_people where id = ${data.personId} limit 1
    `;
      const person = people[0] ? mapOfficePerson(people[0]) : null;
      if (!person) throw new Error("No está esa persona de oficina.");

      let message: string;
      let producerId: string | null = data.producerId ?? null;

      if (data.kind !== "aviso" && data.kind !== "invite")
        throw new Error("Tipo de apoyo no válido.");
      if (data.kind === "aviso") {
        if (data.visitId || data.producerId)
          throw new Error("Un resumen no lleva una ficha o cita individual.");
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
        await assertCanEdit(sql, profile, producerId);
        if (data.producerId && data.producerId !== producerId)
          throw new Error("La cita no corresponde al productor.");
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

      const pingId = newId("png");
      await sql`
      insert into office_pings (id, person_id, person_name, kind, producer_id, message, user_id)
      values (${pingId}, ${person.id}, ${person.name}, ${data.kind}, ${producerId}, ${message}, ${profile.userId})
    `;
      const href = whatsappHref(person.phone, message);
      if (!href) throw new Error("Esa persona no tiene WhatsApp cargado.");
      return { href, personName: person.name, pingId };
    });
  });

export const listOfficePings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const me = await requireProfile(sql, context.userId);
    if (me.role !== "gerente") return { pings: [] as OfficePing[] };
    const rows = await sql<Record<string, unknown>>`
      select id, person_name, kind, producer_id, message, created_at
      from office_pings where confirmed_at is not null
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
    const profile = await requireProfile(sql, context.userId, true);
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
    where p.archived_at is null and v.status = 'programada'
      and v.scheduled_at >= now() - interval '1 hour'
      and v.scheduled_at < now() + interval '2 days'
      and (${mine} = false or p.owner_user_id = ${profile.userId})
      and (${agent} = '' or (p.comisionista_name = ${agent} or p.owner_user_id = ${agent.startsWith("uid:") ? agent.slice(4) : ""}))
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
    lines.push(`Cita ${when}: ${v.producer_name}${who}${v.place ? ` · ${v.place}` : ""}`);
  }

  const closing = await sql<ProducerRow>`
    select name, comisionista_name, hectares, crop, stage, zone
    from producers
    where archived_at is null and cycle = ${CYCLE}
      and stage in ('interesado', 'papeleria', 'evaluacion')
      and (${mine} = false or owner_user_id = ${profile.userId})
      and (${agent} = '' or (comisionista_name = ${agent} or owner_user_id = ${agent.startsWith("uid:") ? agent.slice(4) : ""}))
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

export const previewAccountMerge = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: { sourceId: string; targetId: string }) => d)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await requireProfile(sql, context.userId);
    assertAccessAdmin(me);
    return previewConsolidation(sql, me, data.sourceId, data.targetId);
  });
export const mergeAccounts = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (d: {
      sourceId: string;
      targetId: string;
      confirmEmail: string;
      expectedSourceCount: number;
      expectedTargetCount: number;
    }) => d,
  )
  .handler(async ({ context, data }) =>
    (await getSql()).transaction(async (sql) => {
      const me = await requireProfile(sql, context.userId);
      assertAccessAdmin(me);
      return consolidateAccounts(sql, me, data);
    }),
  );

export const rescheduleVisit = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (d: {
      id: string;
      scheduledAt: string;
      place: string;
      purpose: string;
      notes: string;
      reason: string;
      expectedScheduledAt: string;
    }) => d,
  )
  .handler(async ({ context, data }) =>
    (await getSql()).transaction(async (sql) => {
      const me = await requireProfile(sql, context.userId, true);
      const rows = await sql<ProducerRow>`select * from visits where id=${data.id}`;
      const row = rows[0];
      if (!row) throw new Error("Cita no encontrada.");
      const producer = await assertCanEdit(sql, me, String(row.producer_id));
      if (row.status !== "programada")
        throw new Error("Una cita cumplida o cancelada conserva su historial. Agenda otra visita.");
      if (iso(row.scheduled_at) !== data.expectedScheduledAt)
        throw new Error("Esta cita ya fue reprogramada. Actualiza la agenda.");
      const when = parseLocalDateTime(data.scheduledAt);
      if (Number.isNaN(when.getTime())) throw new Error("Fecha no válida.");
      const reason = data.reason.trim();
      if (!reason) throw new Error("Anota por qué cambia la cita.");
      await sql`update visits set scheduled_at=${when.toISOString()},place=${data.place.trim() || null},purpose=${data.purpose.trim() || null},notes=${data.notes.trim() || null} where id=${data.id}`;
      await logActivity(
        sql,
        producer.id,
        me.userId,
        "cita",
        `Cita reprogramada: ${formatAppDateTime(iso(row.scheduled_at))} → ${formatAppDateTime(when)}. Motivo: ${reason}.`,
      );
      await sql`update producer_tasks set due_at=${when.toISOString()},version=${newId("task")},updated_at=now() where visit_id=${data.id} and status in ('pendiente','esperando')`;
      await writeAudit(sql, me, "cita", data.id, "reprogramar", row, {
        scheduledAt: when.toISOString(),
        place: data.place,
        purpose: data.purpose,
        notes: data.notes,
        reason,
      });
      return { ok: true };
    }),
  );

async function readNextAction(sql: Sql, producer: Producer) {
  const row = (
    await sql<ProducerRow>`select next_action,next_action_at,next_action_version from producers where id=${producer.id}`
  )[0]!;
  return {
    producerId: producer.id,
    text: row.next_action ? String(row.next_action) : null,
    dueAt: row.next_action_at ? iso(row.next_action_at) : null,
    version: String(row.next_action_version),
    ownerName: producer.comisionistaName,
    closed: producer.stage === "cerrado" || producer.cycle !== CYCLE,
  };
}
export const getNextAction = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: { producerId: string }) => d)
  .handler(async ({ context, data }) => {
    const sql = await getSql(),
      me = await requireProfile(sql, context.userId, true);
    return readNextAction(sql, await assertCanEdit(sql, me, data.producerId));
  });
export const saveNextAction = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (d: {
      producerId: string;
      text: string;
      dueAt: string;
      reason?: string;
      expectedVersion: string;
    }) => d,
  )
  .handler(async ({ context, data }) =>
    (await getSql()).transaction(async (sql) => {
      const me = await requireProfile(sql, context.userId, true),
        producer = await assertCanEdit(sql, me, data.producerId);
      const before = await readNextAction(sql, producer);
      if (before.closed)
        throw new Error(
          "Para programar un seguimiento, la ficha debe estar abierta en el ciclo actual.",
        );
      if (before.version !== data.expectedVersion)
        throw new Error("El seguimiento cambió. Actualiza la ficha antes de guardar.");
      const text = data.text?.trim(),
        reason = data.reason?.trim() ?? "",
        date = parseLocalDateTime(data.dueAt ?? "");
      if (!text || text.length > 500)
        throw new Error("Describe la próxima acción en hasta 500 caracteres.");
      if (Number.isNaN(date.getTime()))
        throw new Error("Indica una fecha y hora válidas de Sinaloa.");
      if (before.text && (!reason || reason.length > 1000))
        throw new Error("Anota por qué cambia el seguimiento (hasta 1,000 caracteres).");
      const version = newId("seg");
      await sql`update producers set next_action=${text},next_action_at=${date.toISOString()},next_action_version=${version},updated_at=now() where id=${producer.id}`;
      await sql`insert into producer_tasks(id,producer_id,title,assignee_id,due_at,created_by,version,legacy_primary)
        values(${"legacy-" + producer.id},${producer.id},${text},${producer.attentionUserId || producer.ownerUserId || me.userId},${date.toISOString()},${me.userId},${version},true)
        on conflict(producer_id) where legacy_primary do update set title=excluded.title,assignee_id=excluded.assignee_id,due_at=excluded.due_at,status='pendiente',result=null,completed_at=null,version=excluded.version,updated_at=now()`;

      await writeAudit(
        sql,
        me,
        "seguimiento",
        producer.id,
        before.text ? "cambiar" : "programar",
        before,
        { text, dueAt: date.toISOString(), reason, ownerId: producer.ownerUserId, version },
      );
      await logActivity(
        sql,
        producer.id,
        me.userId,
        "seguimiento",
        before.text
          ? `Seguimiento cambiado: ${before.text} (${formatAppDateTime(before.dueAt!)}) → ${text} (${formatAppDateTime(date)}). Motivo: ${reason}.`
          : `Próxima acción: ${text}. Fecha: ${formatAppDateTime(date)}. Responsable: ${producer.comisionistaName}.`,
      );
      return { ok: true };
    }),
  );
export const finishNextAction = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (d: {
      producerId: string;
      outcome: string;
      status: "atendida" | "cancelada";
      expectedVersion: string;
    }) => d,
  )
  .handler(async ({ context, data }) =>
    (await getSql()).transaction(async (sql) => {
      const me = await requireProfile(sql, context.userId, true),
        producer = await assertCanEdit(sql, me, data.producerId),
        before = await readNextAction(sql, producer);
      if (!["atendida", "cancelada"].includes(data.status)) throw new Error("Resultado no válido.");
      if (!before.text || before.version !== data.expectedVersion)
        throw new Error("El seguimiento cambió o ya se atendió. Actualiza la ficha.");
      const outcome = data.outcome?.trim();
      if (!outcome || outcome.length > 1000)
        throw new Error("Anota el resultado o motivo en hasta 1,000 caracteres.");
      await sql`update producers set next_action=null,next_action_at=null,next_action_version=${newId("seg")},updated_at=now() where id=${producer.id}`;
      await sql`update producer_tasks set status=${data.status},result=${outcome},version=${newId("task")},completed_at=now(),updated_at=now() where producer_id=${producer.id} and legacy_primary`;

      await writeAudit(sql, me, "seguimiento", producer.id, data.status, before, {
        outcome,
        ownerId: producer.ownerUserId,
      });
      await logActivity(
        sql,
        producer.id,
        me.userId,
        "seguimiento",
        `Acción ${data.status}: ${before.text}. Programada: ${formatAppDateTime(before.dueAt!)}. Resultado / motivo: ${outcome}.`,
      );
      return { ok: true };
    }),
  );
export const listNextActions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: { agent?: string; view?: "pendientes" | "sin_accion" } | undefined) => d ?? {})
  .handler(async ({ context, data }) => {
    const sql = await getSql(),
      me = await requireProfile(sql, context.userId, true),
      { mine, agent } = agentScope(me, data.agent);
    const view = data.view ?? "pendientes";
    if (!["pendientes", "sin_accion"].includes(view)) throw new Error("Filtro no válido.");
    const stats = (
      await sql<{
        pending: number;
        overdue: number;
        missing: number;
      }>`select count(*) filter(where next_action is not null)::int as pending,count(*) filter(where next_action_at<now())::int as overdue,count(*) filter(where next_action is null)::int as missing from producers where archived_at is null and cycle=${CYCLE} and stage<>'cerrado' and (not ${mine} or owner_user_id=${me.userId}) and (${mine} or ${agent}='' or (comisionista_name=${agent} or owner_user_id=${agent.startsWith("uid:") ? agent.slice(4) : ""}))`
    )[0]!;
    const rows =
      await sql<ProducerRow>`select id,name,comisionista_name,next_action,next_action_at from producers where archived_at is null and cycle=${CYCLE} and stage<>'cerrado' and (not ${mine} or owner_user_id=${me.userId}) and (${mine} or ${agent}='' or (comisionista_name=${agent} or owner_user_id=${agent.startsWith("uid:") ? agent.slice(4) : ""})) and (case when ${view}='sin_accion' then next_action is null else next_action is not null end) order by next_action_at asc nulls last,name,id limit 100`;
    return {
      stats,
      items: rows.map((r) => ({
        id: String(r.id),
        name: String(r.name),
        ownerName: String(r.comisionista_name),
        text: r.next_action ? String(r.next_action) : null,
        dueAt: r.next_action_at ? iso(r.next_action_at) : null,
        overdue: !!r.next_action_at && new Date(String(r.next_action_at)).getTime() < Date.now(),
      })),
    };
  });

export const confirmOfficePing = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: string }) => d)
  .handler(async ({ context, data }) =>
    (await getSql()).transaction(async (sql) => {
      const me = await requireProfile(sql, context.userId, true);
      const rows =
        await sql<ProducerRow>`select * from office_pings where id=${data.id} and user_id=${me.userId}`;
      const p = rows[0];
      if (!p) throw new Error("No encontramos ese mensaje preparado por ti.");
      if (p.confirmed_at) return { ok: true as const };
      if (p.producer_id) await assertCanEdit(sql, me, String(p.producer_id));
      await sql`update office_pings set confirmed_at=now() where id=${data.id}`;
      if (p.producer_id)
        await logActivity(
          sql,
          String(p.producer_id),
          me.userId,
          "oficina",
          `Envío a ${String(p.person_name)} por WhatsApp confirmado por ${me.displayName}.`,
        );
      return { ok: true as const };
    }),
  );

export const setAccessAdmin = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { userId: string; enabled: boolean; reason: string }) => d)
  .handler(async ({ context, data }) =>
    (await getSql()).transaction(async (sql) => {
      const me = await requireProfile(sql, context.userId);
      assertAccessAdmin(me);
      const reason = requiredReason(data.reason);
      const p = (await sql<ProfileRow>`select * from profiles where user_id=${data.userId}`)[0];
      if (!p || p.role !== "gerente" || p.status !== "activo" || p.merged_into_user_id)
        throw new Error("Elige una gerencia activa.");
      if (me.userId === data.userId && !data.enabled)
        throw new Error("No puedes quitarte tu propio acceso administrativo.");
      await sql`update profiles set access_admin=${Boolean(data.enabled)} where user_id=${data.userId}`;
      await writeAudit(
        sql,
        me,
        "cuenta",
        data.userId,
        "administracion_accesos",
        { enabled: p.access_admin },
        { enabled: data.enabled, reason },
      );
      return { ok: true as const };
    }),
  );

export const setOfficeAssignments = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { userId: string; ownerIds: string[]; reason: string }) => d)
  .handler(async ({ context }) =>
    (await getSql()).transaction(async (sql) => {
      const me = await requireProfile(sql, context.userId);
      assertAccessAdmin(me);
      throw new Error(
        "Oficina ahora opera todas las carteras. Cambia el rol o inhabilita el acceso para retirarle esas facultades.",
      );
    }),
  );

export const listOfficeFiles = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const me = await requireProfile(sql, context.userId, true);
    if (!["oficina", "gerente"].includes(me.role))
      throw new Error("Solo Oficina y gerencia revisan expedientes.");
    const rows =
      await sql<ProducerRow>`select p.id,p.name,p.comisionista_name,p.scheme,p.stage from producers p where p.cycle=${CYCLE} and p.archived_at is null and p.stage<>'cerrado' and (${me.role !== "comisionista"} or p.owner_user_id=${me.userId}) order by p.name`;
    return {
      items: rows.map((r) => ({
        id: String(r.id),
        name: String(r.name),
        ownerName: String(r.comisionista_name),
        scheme: String(r.scheme),
        stage: String(r.stage),
      })),
    };
  });

export const getOfficeFile = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await requireProfile(sql, context.userId, true);
    const p = await assertOfficeFile(sql, me, data.id);
    const docs = await sql<ProducerRow>`select * from documents where producer_id=${data.id}`;
    return {
      id: data.id,
      name: String(p.name),
      ownerName: String(p.comisionista_name),
      documents: visibleDocuments(docs, String(p.scheme), data.id),
    };
  });

export const createTeamInvitation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { email: string }) => d)
  .handler(async ({ context, data }) =>
    (await getSql()).transaction(async (sql) => {
      const me = await requireProfile(sql, context.userId);
      assertAccessAdmin(me);
      const email = data.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
        throw new Error("Escribe un correo válido.");
      if ((await sql`select id from "user" where lower(email)=${email}`).length)
        throw new Error("Ese correo ya tiene cuenta. Revisa su acceso en Equipo.");
      const token = randomBytes(32).toString("base64url"),
        id = newId("invite");
      await sql`update team_invitations set revoked_at=now() where email=${email} and claimed_at is null and revoked_at is null`;
      await sql`insert into team_invitations(id,email,token_hash,created_by,expires_at) values(${id},${email},${createHash("sha256").update(token).digest("hex")},${me.userId},now()+interval '7 days')`;
      await writeAudit(sql, me, "invitacion", id, "crear", null, { email, expiresInDays: 7 });
      return { id, path: "/login?invitacion=" + token, email };
    }),
  );
export const listTeamInvitations = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const me = await requireProfile(sql, context.userId);
    assertAccessAdmin(me);
    return {
      items: await sql<{
        id: string;
        email: string;
        expires_at: string;
        claimed_at: string | null;
        revoked_at: string | null;
      }>`select id,email,expires_at,claimed_at,revoked_at from team_invitations order by created_at desc limit 50`,
    };
  });
export const revokeTeamInvitation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: string }) => d)
  .handler(async ({ context, data }) =>
    (await getSql()).transaction(async (sql) => {
      const me = await requireProfile(sql, context.userId);
      assertAccessAdmin(me);
      await sql`update team_invitations set revoked_at=now() where id=${data.id} and claimed_at is null`;
      await writeAudit(sql, me, "invitacion", data.id, "revocar", null, {});
      return { ok: true as const };
    }),
  );
