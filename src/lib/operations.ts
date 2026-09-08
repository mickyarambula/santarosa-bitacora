import { periodSchema, periodRange } from "./period";
import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireProfile, assertCanEdit, resolveAttention, logActivity } from "./crm";
import { writeAudit } from "./crm-audit";
import { parseLocalDateTime, formatAppDateTime } from "./datetime";
import { CYCLE } from "./catalog";
import type { Profile } from "./types";

const reason = z.string().trim().min(5, "Explica el motivo en al menos cinco letras.").max(1000);
const token = z.string().min(1).max(150);
const kind = z.enum(["comisionista", "empresa", "pendiente"]);
function date(value: string) {
  const d = parseLocalDateTime(value);
  if (!Number.isFinite(d.getTime()) || d.getUTCFullYear() < 2000 || d.getUTCFullYear() > 2100)
    throw new Error("Revisa la fecha y hora.");
  return d.toISOString();
}
const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : String(value));
const staff = (p: Profile) => p.role !== "comisionista";
export const listOperationsPeople = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql(),
      me = await requireProfile(sql, context.userId, true);
    const people = await sql<{
      user_id: string;
      display_name: string;
      role: string;
    }>`select p.user_id,p.display_name,p.role from profiles p where p.status='activo' and p.merged_into_user_id is null and not exists(select 1 from revoked_users r where r.user_id=p.user_id) and (${staff(me)} or p.role in ('oficina','gerente') or p.user_id=${me.userId}) order by p.display_name,p.user_id`;
    return { me, people };
  });

export const assignPortfolio = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) =>
    z
      .object({
        id: token,
        portfolioKind: kind,
        ownerUserId: token.optional(),
        attentionUserId: token,
        reason,
        expectedUpdatedAt: token,
        confirmGroup: z.boolean().default(false),
        reassignOpenTasks: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) =>
    (await getSql()).transaction(async (sql) => {
      const me = await requireProfile(sql, context.userId, true);
      if (!staff(me)) throw new Error("Oficina o Gerencia administran la asignación.");
      const p = await assertCanEdit(sql, me, data.id);
      if (new Date(p.updatedAt).getTime() !== new Date(data.expectedUpdatedAt).getTime())
        throw new Error("La ficha cambió. Actualiza antes de asignar.");
      const ownerId = data.portfolioKind === "comisionista" ? data.ownerUserId : null;
      if (data.portfolioKind === "comisionista" && !ownerId)
        throw new Error("Elige al comisionista.");
      const changed = p.portfolioKind !== data.portfolioKind || p.ownerUserId !== (ownerId ?? "");
      if (changed && me.role === "oficina" && p.portfolioKind !== "pendiente")
        throw new Error("Gerencia debe autorizar el cambio de una cartera establecida.");
      let name = data.portfolioKind === "empresa" ? "Cartera de empresa" : "Pendiente de asignar";
      if (ownerId) {
        const row = (
          await sql<{
            display_name: string;
            role: string;
          }>`select p.display_name,p.role from profiles p where p.user_id=${ownerId} and p.status='activo' and p.merged_into_user_id is null and not exists(select 1 from revoked_users r where r.user_id=p.user_id)`
        )[0];
        if (!row || row.role === "oficina") throw new Error("Elige un comisionista activo.");
        name = row.display_name;
      }
      await resolveAttention(sql, me, data.attentionUserId, data.portfolioKind, ownerId ?? null);
      const attentionName =
        (
          await sql<{
            display_name: string;
          }>`select display_name from profiles where user_id=${data.attentionUserId}`
        )[0]?.display_name ?? data.attentionUserId;
      const members =
        changed && p.groupId
          ? await sql<{
              id: string;
              owner_user_id: string | null;
              portfolio_kind: string;
              attention_user_id: string | null;
            }>`select id,owner_user_id,portfolio_kind,attention_user_id from producers where group_id=${p.groupId} order by id`
          : [
              {
                id: p.id,
                owner_user_id: p.ownerUserId || null,
                portfolio_kind: p.portfolioKind ?? "comisionista",
                attention_user_id: p.attentionUserId ?? null,
              },
            ];
      if (changed && p.groupId && !data.confirmGroup)
        throw new Error(
          `La asignación afecta las ${members.length} fichas del grupo. Confírmalo expresamente.`,
        );
      if (me.role === "oficina" && changed && members.some((m) => m.portfolio_kind !== "pendiente"))
        throw new Error("Gerencia debe revisar la cartera del grupo.");
      const ids = members.map((m) => m.id);
      const displaced = await sql<{
        id: string;
      }>`select t.id from producer_tasks t join profiles a on a.user_id=t.assignee_id where t.producer_id=any(${ids}) and t.status in ('pendiente','esperando') and a.role='comisionista' and (${data.portfolioKind}<>'comisionista' or t.assignee_id is distinct from ${ownerId ?? null})`;
      if (displaced.length && !data.reassignOpenTasks)
        throw new Error(
          `Hay ${displaced.length} tareas cuyo responsable perdería acceso. Confirma trasladarlas a la persona de atención.`,
        );
      for (const m of members) {
        const previousAttention =
          (
            await sql<{
              display_name: string;
            }>`select display_name from profiles where user_id=${m.attention_user_id}`
          )[0]?.display_name ?? "sin dato";
        await sql`update producers set portfolio_kind=${data.portfolioKind},owner_user_id=${ownerId ?? null},comisionista_name=${name},attention_user_id=${data.attentionUserId},updated_at=now() where id=${m.id}`;
        await sql`update visits set owner_user_id=${ownerId ?? null} where producer_id=${m.id}`;
        await writeAudit(sql, me, "productor", m.id, "asignacion", m, {
          portfolioKind: data.portfolioKind,
          ownerId,
          attentionId: data.attentionUserId,
          reason: data.reason,
        });
        await logActivity(
          sql,
          m.id,
          me.userId,
          "asignacion",
          `Cartera: ${p.comisionistaName} → ${name}. Atención: ${previousAttention} → ${attentionName}. Motivo: ${data.reason}.`,
        );
      }
      if (changed && p.groupId)
        await sql`update producer_groups set portfolio_kind=${data.portfolioKind},owner_user_id=${ownerId ?? null},comisionista_name=${name},updated_at=now() where id=${p.groupId}`;
      for (const task of displaced) {
        await sql`update producer_tasks set assignee_id=${data.attentionUserId},version=${randomUUID()},updated_at=now() where id=${task.id}`;
        await writeAudit(sql, me, "tarea", task.id, "traslado_cartera", null, {
          assigneeId: data.attentionUserId,
          reason: data.reason,
        });
      }
      return { ok: true, affected: ids.length };
    }),
  );

export type TaskRow = {
  id: string;
  producer_id: string;
  title: string;
  assignee_id: string;
  assignee_name: string;
  due_at: string;
  status: string;
  result: string | null;
  version: string;
  legacy_primary: boolean;
  visit_id: string | null;
};
export const listProducerTasks = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: unknown) =>
    z.object({ producerId: token, page: z.number().int().min(0).default(0) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql(),
      me = await requireProfile(sql, context.userId, true);
    await assertCanEdit(sql, me, data.producerId, true);
    const rows =
      await sql<TaskRow>`select t.*,coalesce(p.display_name,'Cuenta anterior') as assignee_name from producer_tasks t left join profiles p on p.user_id=t.assignee_id where t.producer_id=${data.producerId} order by (t.status in ('pendiente','esperando')) desc,t.due_at,t.id limit 21 offset ${data.page * 20}`;
    return {
      hasMore: rows.length > 20,
      items: rows.slice(0, 20).map((t) => ({ ...t, due_at: iso(t.due_at) })),
    };
  });
const taskInput = z.object({
  id: token,
  producerId: token,
  title: z.string().trim().min(1).max(500),
  assigneeId: token,
  dueAt: token,
  status: z.enum(["pendiente", "esperando"]).default("pendiente"),
  expectedVersion: token.optional(),
  reason: reason.optional(),
  visitId: token.optional(),
});
export const saveProducerTask = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => taskInput.parse(d))
  .handler(async ({ context, data }) =>
    (await getSql()).transaction(async (sql) => {
      const me = await requireProfile(sql, context.userId, true),
        p = await assertCanEdit(sql, me, data.producerId);
      if (p.stage === "cerrado" || p.cycle !== CYCLE)
        throw new Error("El expediente está cerrado para seguimiento.");
      const a = (
        await sql<{
          role: string;
          display_name: string;
        }>`select p.role,p.display_name from profiles p where p.user_id=${data.assigneeId} and p.status='activo' and p.merged_into_user_id is null and not exists(select 1 from revoked_users r where r.user_id=p.user_id)`
      )[0];
      if (!a || (a.role === "comisionista" && data.assigneeId !== p.ownerUserId))
        throw new Error(
          "Asigna la tarea al comisionista de esta cartera, Oficina o Gerencia activos.",
        );
      const before = (await sql<TaskRow>`select * from producer_tasks where id=${data.id}`)[0];
      const dueAt = date(data.dueAt);
      if (before) {
        if (before.producer_id !== p.id) throw new Error("La tarea pertenece a otro expediente.");
        if (
          !data.expectedVersion &&
          before.title === data.title &&
          before.assignee_id === data.assigneeId &&
          new Date(before.due_at).getTime() === new Date(dueAt).getTime() &&
          before.status === data.status &&
          (before.visit_id ?? undefined) === data.visitId
        )
          return { id: data.id };
        if (before.version !== data.expectedVersion)
          throw new Error("La tarea cambió. Actualiza la ficha.");
        if (!["pendiente", "esperando"].includes(before.status))
          throw new Error("La tarea ya terminó; crea un nuevo pendiente.");
        if (!data.reason) throw new Error("Explica el cambio de tarea.");
      }
      const visitId = before?.visit_id ?? data.visitId;
      if (before && data.visitId && data.visitId !== before.visit_id)
        throw new Error("Crea una tarea nueva para vincular otra cita.");
      if (visitId) {
        const v = (
          await sql<{
            scheduled_at: string;
            status: string;
          }>`select scheduled_at,status from visits where id=${visitId} and producer_id=${p.id}`
        )[0];
        if (!v || v.status !== "programada")
          throw new Error("Elige una cita programada de esta ficha.");
        if (new Date(v.scheduled_at).getTime() !== new Date(dueAt).getTime())
          throw new Error("La tarea vinculada debe tener la fecha de la cita.");
        const linked = (
          await sql<{ id: string }>`select id from producer_tasks where visit_id=${visitId}`
        )[0];
        if (linked && linked.id !== data.id)
          throw new Error("Esa cita ya tiene tarea de seguimiento.");
      }
      const version = randomUUID();
      if (before)
        await sql`update producer_tasks set title=${data.title},assignee_id=${data.assigneeId},due_at=${dueAt},status=${data.status},version=${version},updated_at=now() where id=${data.id}`;
      else
        await sql`insert into producer_tasks(id,producer_id,title,assignee_id,due_at,status,created_by,version,visit_id) values(${data.id},${p.id},${data.title},${data.assigneeId},${dueAt},${data.status},${me.userId},${version},${data.visitId ?? null})`;
      if (before?.legacy_primary)
        await sql`update producers set next_action=${data.title},next_action_at=${dueAt},next_action_version=${version},updated_at=now() where id=${p.id}`;
      await writeAudit(sql, me, "tarea", data.id, before ? "editar" : "crear", before ?? null, {
        ...data,
        dueAt,
        version,
      });
      await logActivity(
        sql,
        p.id,
        me.userId,
        "tarea",
        `${before ? "Tarea ajustada" : "Tarea creada"}: ${data.title}. ${formatAppDateTime(dueAt)}. Responsable: ${a.display_name}. Estado: ${data.status}.${data.reason ? " Motivo: " + data.reason : ""}`,
      );
      return { id: data.id };
    }),
  );
export const finishProducerTask = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) =>
    z
      .object({
        id: token,
        expectedVersion: token,
        status: z.enum(["atendida", "cancelada"]),
        result: reason,
      })
      .parse(d),
  )
  .handler(async ({ context, data }) =>
    (await getSql()).transaction(async (sql) => {
      const me = await requireProfile(sql, context.userId, true),
        t = (await sql<TaskRow>`select * from producer_tasks where id=${data.id}`)[0];
      if (!t) throw new Error("Tarea no encontrada.");
      const p = await assertCanEdit(sql, me, t.producer_id);
      if (t.status === data.status && t.result === data.result) return { ok: true };
      if (!["pendiente", "esperando"].includes(t.status) || t.version !== data.expectedVersion)
        throw new Error("La tarea cambió o ya terminó.");
      if (t.visit_id)
        throw new Error(
          "Registra el resultado desde la cita vinculada para no duplicar su atención.",
        );
      await sql`update producer_tasks set status=${data.status},result=${data.result},completed_at=now(),updated_at=now(),version=${randomUUID()} where id=${t.id}`;
      if (t.legacy_primary)
        await sql`update producers set next_action=null,next_action_at=null,next_action_version=${randomUUID()},updated_at=now() where id=${p.id}`;
      await writeAudit(sql, me, "tarea", t.id, data.status, t, { result: data.result });
      await logActivity(
        sql,
        p.id,
        me.userId,
        "tarea",
        `Tarea ${data.status}: ${t.title}. Resultado: ${data.result}`,
      );
      return { ok: true };
    }),
  );

export const listWorkInbox = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: unknown) =>
    z
      .object({
        view: z
          .enum([
            "hoy",
            "vencido",
            "esperando",
            "pendientes",
            "asignacion",
            "sin_accion",
            "papeleria",
            "gerencia",
          ])
          .default("hoy"),
        scope: z.enum(["mine", "team"]).default("mine"),
        q: z.string().trim().max(150).default(""),
        page: z.number().int().min(0).max(100000).default(0),
        agent: z.string().max(250).optional(),
      })
      .merge(periodSchema)
      .parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql(),
      me = await requireProfile(sql, context.userId, true);
    const team = staff(me) && data.scope === "team",
      search = "%" + data.q + "%",
      agent = data.agent === "__mine__" ? "uid:" + me.userId : (data.agent ?? "");
    const taskView = ["hoy", "vencido", "esperando", "pendientes"].includes(data.view);
    const dates = periodRange({ ...data, period: data.period ?? "todo" });
    const rows = taskView
      ? await sql<
          Record<string, unknown>
        >`select t.id,p.id as producer_id,p.name,p.comisionista_name,t.title,t.due_at,coalesce(a.display_name,'Cuenta anterior') as assignee_name,t.status,count(*) over()::int as total from producer_tasks t join producers p on p.id=t.producer_id left join profiles a on a.user_id=t.assignee_id where p.archived_at is null and p.cycle=${CYCLE} and p.stage<>'cerrado' and t.status in ('pendiente','esperando') and t.due_at>=${dates.start}::timestamptz and t.due_at<${dates.end}::timestamptz and (${staff(me)} or p.owner_user_id=${me.userId}) and (${agent}='' or p.comisionista_name=${agent} or p.owner_user_id=${agent.startsWith("uid:") ? agent.slice(4) : ""}) and (${team} or t.assignee_id=${me.userId}) and (p.name ilike ${search} or t.title ilike ${search} or p.comisionista_name ilike ${search}) and (case when ${data.view}='hoy' then (t.due_at at time zone 'America/Mazatlan')::date=(now() at time zone 'America/Mazatlan')::date when ${data.view}='vencido' then t.due_at<now() when ${data.view}='esperando' then t.status='esperando' else true end) order by t.due_at,t.id limit 26 offset ${data.page * 25}`
      : await sql<
          Record<string, unknown>
        >`select p.id,p.id as producer_id,p.name,p.comisionista_name,coalesce(a.display_name,'Sin responsable activo') as assignee_name,${data.view} as status,count(*) over()::int as total from producers p left join profiles a on a.user_id=p.attention_user_id where p.archived_at is null and p.cycle=${CYCLE} and p.stage<>'cerrado' and (${staff(me)} or p.owner_user_id=${me.userId}) and (${agent}='' or p.comisionista_name=${agent} or p.owner_user_id=${agent.startsWith("uid:") ? agent.slice(4) : ""}) and (${team} or p.attention_user_id=${me.userId} or (${!staff(me)} and p.owner_user_id=${me.userId})) and (p.name ilike ${search} or p.comisionista_name ilike ${search}) and (case when ${data.view}='asignacion' then p.portfolio_kind='pendiente' or a.user_id is null or a.status<>'activo' when ${data.view}='sin_accion' then not exists(select 1 from producer_tasks t where t.producer_id=p.id and t.status in ('pendiente','esperando')) when ${data.view}='papeleria' then exists(select 1 from documents d where d.producer_id=p.id and d.status in ('pendiente','no_hizo','recibido','entregado') and (p.scheme||':'||d.doc_type)=any(${activeDocs()})) else p.stage='evaluacion' end) order by p.name,p.id limit 26 offset ${data.page * 25}`;
    return {
      total: Number(rows[0]?.total ?? 0),
      hasMore: rows.length > 25,
      items: rows.slice(0, 25).map((r) => ({
        id: String(r.id),
        producerId: String(r.producer_id),
        name: String(r.name),
        portfolio: String(r.comisionista_name),
        assignee: String(r.assignee_name),
        title: r.title
          ? String(r.title)
          : ({
              hoy: "",
              vencido: "",
              esperando: "",
              pendientes: "",
              asignacion: "Resolver cartera o responsable",
              sin_accion: "Definir el siguiente paso",
              papeleria: "Revisar papelería",
              gerencia: "Decisión de Gerencia",
            }[data.view] ?? ""),
        dueAt: r.due_at ? iso(r.due_at) : null,
        status: String(r.status),
      })),
    };
  });
import { DOC_CATALOG } from "./catalog";
function activeDocs() {
  return Object.entries(DOC_CATALOG).flatMap(([scheme, docs]) =>
    docs.map((d) => scheme + ":" + d.id),
  );
}

const communicationInput = z.object({
  id: token,
  producerId: token,
  channel: z.enum(["whatsapp", "correo", "llamada", "oficina"]),
  direction: z.enum(["salida", "entrada"]),
  destination: z.string().trim().min(1).max(254),
  body: z.string().trim().min(1).max(5000),
  documentReference: z.string().trim().max(1000).optional(),
});
export const prepareCommunication = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => communicationInput.parse(d))
  .handler(async ({ context, data }) =>
    (await getSql()).transaction(async (sql) => {
      const me = await requireProfile(sql, context.userId, true),
        p = await assertCanEdit(sql, me, data.producerId);
      const exists = (
        await sql<{
          producer_id: string;
          created_by: string;
          body: string;
          channel: string;
          direction: string;
          destination: string;
          document_reference: string | null;
        }>`select producer_id,created_by,body,channel,direction,destination,document_reference from producer_communications where id=${data.id}`
      )[0];
      if (exists) {
        if (
          exists.producer_id !== p.id ||
          exists.created_by !== me.userId ||
          exists.body !== data.body ||
          exists.channel !== data.channel ||
          exists.direction !== data.direction ||
          exists.destination !== data.destination ||
          (exists.document_reference ?? "") !== (data.documentReference ?? "")
        )
          throw new Error("La comunicación ya existe con otro contenido.");
        return { id: data.id };
      }
      const status = data.direction === "entrada" ? "recibido" : "borrador";
      await sql`insert into producer_communications(id,producer_id,channel,direction,status,destination,body,document_reference,created_by,confirmed_by,happened_at,version) values(${data.id},${p.id},${data.channel},${data.direction},${status},${data.destination},${data.body},${data.documentReference ?? null},${me.userId},${data.direction === "entrada" ? me.userId : null},${data.direction === "entrada" ? new Date().toISOString() : null},${randomUUID()})`;
      await writeAudit(sql, me, "comunicacion", data.id, status, null, { ...data, status });
      await logActivity(
        sql,
        p.id,
        me.userId,
        "comunicacion",
        `${status === "recibido" ? "Comunicación recibida" : "Borrador preparado"} · ${data.channel} · ${data.destination}. ${data.body.slice(0, 160)}`,
      );
      if (status === "recibido")
        await sql`update producers set last_touch_at=now(),last_touch_channel=${data.channel},updated_at=now() where id=${p.id}`;
      return { id: data.id };
    }),
  );
export const confirmCommunication = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) =>
    z
      .object({
        id: token,
        expectedVersion: token,
        status: z.enum(["enviado_manual", "fallo", "cancelado"]),
        result: reason,
      })
      .parse(d),
  )
  .handler(async ({ context, data }) =>
    (await getSql()).transaction(async (sql) => {
      const me = await requireProfile(sql, context.userId, true),
        c = (
          await sql<
            Record<string, unknown>
          >`select * from producer_communications where id=${data.id}`
        )[0];
      if (!c) throw new Error("Comunicación no encontrada.");
      const p = await assertCanEdit(sql, me, String(c.producer_id));
      if (c.created_by !== me.userId)
        throw new Error("La persona que preparó el mensaje debe confirmar qué ocurrió.");
      if (c.status === data.status && c.result === data.result) return { ok: true };
      if (c.direction !== "salida" || c.status !== "borrador" || c.version !== data.expectedVersion)
        throw new Error("La comunicación cambió o ya se confirmó.");
      await sql`update producer_communications set status=${data.status},result=${data.result},confirmed_by=${me.userId},happened_at=now(),version=${randomUUID()} where id=${data.id}`;
      await writeAudit(
        sql,
        me,
        "comunicacion",
        data.id,
        data.status,
        { status: c.status },
        { result: data.result },
      );
      await logActivity(
        sql,
        p.id,
        me.userId,
        "comunicacion",
        `${data.status === "enviado_manual" ? "Envío confirmado por quien lo realizó" : data.status === "fallo" ? "Envío fallido" : "Borrador cancelado"} · ${c.channel}. ${data.result}`,
      );
      if (data.status === "enviado_manual")
        await sql`update producers set last_touch_at=now(),last_touch_channel=${String(c.channel)},updated_at=now() where id=${p.id}`;
      return { ok: true };
    }),
  );
export const listCommunications = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: unknown) =>
    z.object({ producerId: token, page: z.number().int().min(0).default(0) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql(),
      me = await requireProfile(sql, context.userId, true);
    await assertCanEdit(sql, me, data.producerId, true);
    const rows = await sql<
      Record<string, unknown>
    >`select c.*,coalesce(p.display_name,'Cuenta anterior') as actor_name from producer_communications c left join profiles p on p.user_id=c.created_by where c.producer_id=${data.producerId} order by c.created_at desc,c.id desc limit 21 offset ${data.page * 20}`;
    return {
      hasMore: rows.length > 20,
      items: rows.slice(0, 20).map((c) => ({
        id: String(c.id),
        channel: String(c.channel),
        direction: String(c.direction),
        status: String(c.status),
        destination: String(c.destination),
        body: String(c.body),
        reference: c.document_reference ? String(c.document_reference) : null,
        actor: String(c.actor_name),
        createdAt: iso(c.created_at),
        happenedAt: c.happened_at ? iso(c.happened_at) : null,
        result: c.result ? String(c.result) : null,
        version: String(c.version),
        canConfirm: c.created_by === me.userId && c.status === "borrador",
      })),
    };
  });

export const listProducerHistory = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: unknown) =>
    z
      .object({
        producerId: token,
        page: z.number().int().min(0).max(100000).default(0),
        kind: z.string().max(80).default(""),
        q: z.string().trim().max(150).default(""),
      })
      .merge(periodSchema)
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql(),
      me = await requireProfile(sql, context.userId, true);
    await assertCanEdit(sql, me, data.producerId, true);
    const search = "%" + data.q + "%";
    const dates = periodRange({ ...data, period: data.period ?? "todo" });
    const [rows, kinds] = await Promise.all([
      sql<{
        id: string;
        kind: string;
        message: string;
        actor: string;
        created_at: string;
        total: number;
      }>`select a.id,a.kind,a.message,coalesce(p.display_name,u.name,'Cuenta anterior') as actor,a.created_at,count(*) over()::int as total from activity a left join profiles p on p.user_id=a.user_id left join "user" u on u.id=a.user_id where a.producer_id=${data.producerId} and a.created_at>=${dates.start}::timestamptz and a.created_at<${dates.end}::timestamptz and (${data.kind}='' or a.kind=${data.kind}) and (a.message ilike ${search} or coalesce(p.display_name,u.name,'Cuenta anterior') ilike ${search}) order by a.created_at desc,a.id desc limit 26 offset ${data.page * 25}`,
      sql<{
        kind: string;
      }>`select distinct kind from activity where producer_id=${data.producerId} order by kind`,
    ]);
    return {
      total: Number(rows[0]?.total ?? 0),
      hasMore: rows.length > 25,
      kinds: kinds.map((k) => k.kind),
      items: rows.slice(0, 25).map((r) => ({ ...r, createdAt: iso(r.created_at) })),
    };
  });

export const searchReception = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: unknown) => z.object({ q: z.string().trim().min(2).max(150) }).parse(d))
  .handler(async ({ context, data }) => {
    const sql = await getSql(),
      me = await requireProfile(sql, context.userId, true);
    if (!staff(me)) throw new Error("Oficina o Gerencia consultan la recepción general.");
    const text = "%" + data.q + "%",
      digits = data.q.replace(/\D/g, "").slice(-10);
    const rows = await sql<{
      id: string;
      name: string;
      phone: string | null;
      comisionista_name: string;
      archived_at: string | null;
    }>`select id,name,phone,comisionista_name,archived_at from producers where cycle=${CYCLE} and (name ilike ${text} or phone ilike ${text} or (${digits.length >= 7} and regexp_replace(coalesce(phone,''),'[^0-9]','','g') like ${"%" + digits + "%"})) order by name,id limit 21`;
    return {
      hasMore: rows.length > 20,
      items: rows.slice(0, 20).map((r) => ({
        id: r.id,
        name: r.name,
        phone: r.phone,
        portfolio: r.comisionista_name,
        archived: !!r.archived_at,
      })),
    };
  });
