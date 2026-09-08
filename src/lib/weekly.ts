import { createHash, randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import { requireProfile } from "./crm";
import { writeAudit } from "./crm-audit";
import { CYCLE, docLabel, DOC_STATUS } from "./catalog";
import { weekRange } from "./weekly-dates";
import type { Profile } from "./types";

const input = z.object({ date: z.string().max(10) });
export type WeekEvent = {
  id: string;
  producerId: string;
  name: string;
  portfolioId: string;
  portfolio: string;
  actor: string;
  kind: string;
  detail: string;
  at: string;
  target?: string;
};
export type WeekTask = {
  id: string;
  producerId: string;
  name: string;
  portfolioId: string;
  title: string;
  assignee: string;
  dueAt: string;
  status: string;
  result: string | null;
  completedAt: string | null;
};
export type WeekProducer = {
  id: string;
  name: string;
  portfolioId: string;
  portfolio: string;
  blocker: string | null;
  stage: string;
  attention: string;
  hasNext: boolean;
  lastTouch: string | null;
};
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));
const portfolioId = (p: Record<string, unknown>) => String(p.owner_user_id || p.portfolio_kind);
async function readEvents(
  sql: Sql,
  me: Profile,
  range: ReturnType<typeof weekRange>,
  producerId = "",
  eventId = "",
) {
  const staff = me.role !== "comisionista";
  return sql<Record<string, unknown>>`with events as (
      select t.id,t.producer_id,t.owner_user_id as actor_id,'contacto' as kind,
        concat(t.channel,' · ',t.outcome,' · ',t.summary) as detail,t.happened_at as at,'contactos' as target
        from touches t where t.channel<>'nota'
      union all
      select c.id,c.producer_id,coalesce(c.confirmed_by,c.created_by),'contacto',
        concat(c.channel,' · ',case when c.status='recibido' then 'Recibido' else 'Envío confirmado manualmente' end,' · ',c.body),c.happened_at,'comunicaciones'
        from producer_communications c where c.status in ('recibido','enviado_manual')
      union all
      select a.id,a.producer_id,a.user_id,a.kind,a.message,a.created_at,'bitacora' from activity a
        where a.kind in ('alta','etapa')
      union all
      select a.id,d.producer_id,a.actor_user_id,'documento',concat(d.doc_type,' · ',a.after_data->>'status'),a.created_at,concat('documento-',d.id)
        from crm_audit a join documents d on d.id=a.entity_id
        where a.entity_type='documento' and a.action='estado'
        and a.after_data->>'status' in ('recibido','entregado','validado')
        and a.before_data->>'status' is distinct from a.after_data->>'status'
      union all
      select a.id,v.producer_id,a.actor_user_id,'visita',concat(v.purpose,' · ',a.after_data->>'notes'),a.created_at,concat('cita-',v.id)
        from crm_audit a join visits v on v.id=a.entity_id
        where a.entity_type='cita' and a.action='estado' and a.after_data->>'status'='cumplida'
        and a.before_data->>'status' is distinct from 'cumplida'
    ) select e.*,p.name,p.owner_user_id,p.portfolio_kind,p.comisionista_name,p.scheme,
        coalesce(a.display_name,'Cuenta anterior') as actor
      from events e join producers p on p.id=e.producer_id left join profiles a on a.user_id=e.actor_id
      where p.cycle=${CYCLE} and not p.is_example and (${staff} or p.owner_user_id=${me.userId})
      and (${producerId} = '' or p.id=${producerId}) and (${eventId} = '' or e.id=${eventId})
      and e.at>=${range.start}::timestamptz and e.at<${range.end}::timestamptz and e.at<=now()
      order by e.at desc,e.id limit 10001`;
}
function mapEvent(e: Record<string, unknown>): WeekEvent {
  let detail = String(e.detail);
  if (e.kind === "documento") {
    const [docType, status] = detail.split(" · ");
    detail = `${docLabel(String(e.scheme), docType)} · ${DOC_STATUS.find((s) => s.id === status)?.label ?? status}`;
  }
  return {
    id: String(e.id),
    producerId: String(e.producer_id),
    name: String(e.name),
    portfolioId: portfolioId(e),
    portfolio: String(e.comisionista_name),
    actor: String(e.actor),
    kind: String(e.kind),
    detail,
    at: iso(e.at),
    target: String(e.target),
  };
}
async function report(sql: Sql, me: Profile, day: string) {
  const range = weekRange(day),
    staff = me.role !== "comisionista";
  const [events, producers, tasks, people] = await Promise.all([
    readEvents(sql, me, range),
    sql<
      Record<string, unknown>
    >`select p.id,p.name,p.owner_user_id,p.portfolio_kind,p.comisionista_name,p.blocker,p.stage,p.last_touch_at,
      coalesce(a.display_name,'Sin responsable') as attention,
      exists(select 1 from producer_tasks t where t.producer_id=p.id and t.status in ('pendiente','esperando')) as has_next
      from producers p left join profiles a on a.user_id=p.attention_user_id
      where p.cycle=${CYCLE} and not p.is_example and p.archived_at is null and p.stage<>'cerrado' and coalesce(p.rejection_kind,'')<>'total'
      and (${staff} or p.owner_user_id=${me.userId}) order by p.name,p.id limit 10001`,
    sql<
      Record<string, unknown>
    >`select t.*,p.name,p.owner_user_id,p.portfolio_kind,coalesce(a.display_name,'Cuenta anterior') as assignee
      from producer_tasks t join producers p on p.id=t.producer_id left join profiles a on a.user_id=t.assignee_id
      where p.cycle=${CYCLE} and not p.is_example and (${staff} or p.owner_user_id=${me.userId})
      and ((t.status in ('pendiente','esperando') and p.archived_at is null and p.stage<>'cerrado')
        or (t.completed_at>=${range.start}::timestamptz and t.completed_at<${range.end}::timestamptz and t.completed_at<=now()))
      order by t.due_at,t.id limit 10001`,
    sql<{
      user_id: string;
      display_name: string;
      role: string;
      email: string;
    }>`select p.user_id,p.display_name,p.role,u.email from profiles p left join "user" u on u.id=p.user_id
      where p.role in ('comisionista','gerente','oficina') and p.status='activo' and p.merged_into_user_id is null
      and not exists(select 1 from revoked_users r where r.user_id=p.user_id)
      and (${staff} or p.user_id=${me.userId}) order by p.display_name,p.user_id`,
  ]);
  if ([events, producers, tasks].some((x) => x.length > 10000))
    throw new Error(
      "El informe supera 10,000 registros. Se requiere una consulta paginada; no se mostrarán cifras incompletas.",
    );
  const mappedEvents = events.map(mapEvent);
  const mappedTasks: WeekTask[] = tasks.map((t) => ({
    id: String(t.id),
    producerId: String(t.producer_id),
    name: String(t.name),
    portfolioId: portfolioId(t),
    title: String(t.title),
    assignee: String(t.assignee),
    dueAt: iso(t.due_at),
    status: String(t.status),
    result: t.result ? String(t.result) : null,
    completedAt: t.completed_at ? iso(t.completed_at) : null,
  }));
  const mappedProducers: WeekProducer[] = producers.map((p) => ({
    id: String(p.id),
    name: String(p.name),
    portfolioId: portfolioId(p),
    portfolio: String(p.comisionista_name),
    blocker: p.blocker ? String(p.blocker) : null,
    stage: String(p.stage),
    attention: String(p.attention),
    hasNext: Boolean(p.has_next),
    lastTouch: p.last_touch_at ? iso(p.last_touch_at) : null,
  }));
  const portfolios = new Map(people.map((p) => [p.user_id, p.display_name]));
  if (staff) {
    portfolios.set("empresa", "Empresa · sin comisionista");
    portfolios.set("pendiente", "Pendiente de asignar");
  }
  for (const p of [...mappedProducers, ...mappedEvents])
    if (!portfolios.has(p.portfolioId)) portfolios.set(p.portfolioId, p.portfolio);
  const result = {
    range,
    events: mappedEvents,
    tasks: mappedTasks,
    producers: mappedProducers,
    portfolios: [...portfolios].map(([id, name]) => {
      const person = people.find((p) => p.user_id === id);
      const duplicates =
        [...portfolios.values()].filter(
          (n) => n.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase(),
        ).length > 1;
      return {
        id,
        name,
        role: person?.role,
        identity: duplicates ? person?.email || `Cuenta ${id.slice(-8)}` : undefined,
      };
    }),
  };
  return { ...result, version: createHash("sha256").update(JSON.stringify(result)).digest("hex") };
}
export const getWeeklyReport = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d) => input.parse(d))
  .handler(async ({ context, data }) => {
    const sql = await getSql(),
      me = await requireProfile(sql, context.userId, true);
    const result = await report(sql, me, data.date);
    const closed =
      me.role === "comisionista"
        ? []
        : await sql<{
            id: string;
            notes: string;
            closed_at: string;
            author: string;
            snapshot: typeof result;
          }>`select m.id,m.notes,m.closed_at,m.snapshot,coalesce(p.display_name,'Cuenta anterior') as author from weekly_meetings m left join profiles p on p.user_id=m.closed_by where m.cycle=${CYCLE} and m.week_start=${result.range.key}::date`;
    return {
      ...result,
      asOf: new Date().toISOString(),
      closed: closed[0] ? { ...closed[0], closedAt: iso(closed[0].closed_at) } : null,
    };
  });
export const closeWeeklyMeeting = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d) =>
    input
      .extend({
        notes: z.string().trim().min(5, "Escribe un resumen de los acuerdos.").max(5000),
        expectedVersion: z.string().length(64),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) =>
    (await getSql()).transaction(async (sql) => {
      const me = await requireProfile(sql, context.userId, true);
      if (me.role !== "gerente") throw new Error("Solo Gerencia cierra la junta.");
      const range = weekRange(data.date);
      if (new Date(range.start) > new Date())
        throw new Error("No se puede cerrar una junta futura.");
      const previous = await sql<{
        id: string;
        notes: string;
      }>`select id,notes from weekly_meetings where cycle=${CYCLE} and week_start=${range.key}::date`;
      if (previous[0]) {
        if (previous[0].notes === data.notes) return { id: previous[0].id };
        throw new Error("La junta ya está cerrada. Su resumen se conserva sin sobrescribirlo.");
      }
      const snapshot = await report(sql, me, data.date);
      if (snapshot.version !== data.expectedVersion)
        throw new Error("Hubo cambios desde tu revisión. Actualiza el informe antes de cerrar.");
      const id = randomUUID();
      await sql`insert into weekly_meetings(id,cycle,week_start,notes,snapshot,closed_by) values(${id},${CYCLE},${range.key},${data.notes},${JSON.stringify(snapshot)}::jsonb,${me.userId})`;
      await writeAudit(sql, me, "junta", id, "cerrar", null, {
        weekStart: range.key,
        notes: data.notes,
      });
      return { id };
    }),
  );

// The requested event is always resolved inside the caller's authorized portfolio.
export const getWeeklyEvent = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d) =>
    z
      .object({
        date: z.string().max(10),
        producerId: z.string().min(1).max(150),
        eventId: z.string().min(1).max(150),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql(),
      me = await requireProfile(sql, context.userId, true);
    const rows = await readEvents(sql, me, weekRange(data.date), data.producerId, data.eventId);
    const event = rows[0] ? mapEvent(rows[0]) : null;
    if (!event)
      throw new Error("Este movimiento ya no está disponible en tu cartera para esta semana.");
    return event;
  });
