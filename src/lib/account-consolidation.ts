import type { Sql } from "./db";
import { writeAudit } from "./crm-audit";
import { randomUUID } from "node:crypto";

type Actor = { userId: string; displayName: string; role: string };
export async function previewConsolidation(
  sql: Sql,
  actor: Actor,
  sourceId: string,
  targetId: string,
) {
  if (actor.role !== "gerente") throw new Error("Solo gerencia puede unificar cuentas.");
  if (!sourceId || !targetId || sourceId === targetId)
    throw new Error("Elige dos cuentas diferentes.");
  if (sourceId === actor.userId)
    throw new Error("Otra persona de gerencia debe unificar tu cuenta.");
  const profiles = await sql<{
    user_id: string;
    display_name: string;
    email: string;
    role: string;
    status: string;
    merged_into_user_id: string | null;
  }>`
    select p.*,u.email from profiles p join "user" u on u.id=p.user_id where p.user_id in (${sourceId},${targetId})`;
  const source = profiles.find((p) => p.user_id === sourceId),
    target = profiles.find((p) => p.user_id === targetId);
  if (!source || !target) throw new Error("No encontramos ambas cuentas.");
  if (source.merged_into_user_id || target.merged_into_user_id)
    throw new Error("Una cuenta ya fue unificada. Actualiza la lista.");
  if (target.role === "oficina")
    throw new Error("La cuenta de destino debe llevar cartera de campo o gerencia.");
  if (target.status !== "activo") throw new Error("La cuenta que se conserva debe estar activa.");
  const references =
    await sql`select user_id from profiles where merged_into_user_id=${sourceId} limit 1`;
  if (references.length)
    throw new Error(
      "Esta cuenta ya conserva una unificación anterior. Revisa su historial antes de volver a unificar.",
    );
  const revoked = await sql`select user_id from revoked_users where user_id=${targetId}`;
  if (revoked.length) throw new Error("La cuenta de destino está inhabilitada.");
  const producers = await sql<{
    id: string;
    owner_user_id: string;
    comisionista_name: string;
    hectares: string;
  }>`select id,owner_user_id,comisionista_name,hectares from producers where owner_user_id in (${sourceId},${targetId}) order by id`;
  const mixed = await sql`select p.id from producers p join producer_groups g on g.id=p.group_id
    where (p.owner_user_id=${sourceId} or g.owner_user_id=${sourceId}) and
    (p.owner_user_id not in (${sourceId},${targetId}) or g.owner_user_id not in (${sourceId},${targetId})) limit 1`;
  if (mixed.length)
    throw new Error("Hay un grupo con otra cartera. Revisa su responsable antes de unificar.");
  return {
    source,
    target,
    producers,
    sourceCount: producers.filter((p) => p.owner_user_id === sourceId).length,
    targetCount: producers.filter((p) => p.owner_user_id === targetId).length,
  };
}
// Call only inside the CRM transaction, after explicit source/target confirmation.
export async function consolidateAccounts(
  sql: Sql,
  actor: Actor,
  data: {
    sourceId: string;
    targetId: string;
    confirmEmail: string;
    expectedSourceCount: number;
    expectedTargetCount: number;
  },
) {
  const plan = await previewConsolidation(sql, actor, data.sourceId, data.targetId);
  if (data.confirmEmail.trim().toLowerCase() !== plan.target.email.toLowerCase())
    throw new Error("Confirma el correo de la cuenta que se conserva.");
  if (
    plan.sourceCount !== data.expectedSourceCount ||
    plan.targetCount !== data.expectedTargetCount
  )
    throw new Error("La cartera cambió. Revisa nuevamente antes de unificar.");
  if (plan.source.role === "gerente" && plan.source.status === "activo") {
    const others = await sql<{
      n: number;
    }>`select count(*)::int as n from profiles where role='gerente' and status='activo' and user_id<>${data.sourceId} and merged_into_user_id is null`;
    if (!others[0]?.n) throw new Error("Debe quedar una gerencia activa.");
  }
  if (
    plan.target.role === "comisionista" &&
    (
      await sql`select id from producers where attention_user_id=${data.sourceId} and (portfolio_kind<>'comisionista' or owner_user_id not in (${data.sourceId},${data.targetId}))`
    ).length
  )
    throw new Error("Reasigna la atención de las otras carteras antes de unificar esta cuenta.");
  if (
    plan.target.role === "comisionista" &&
    (
      await sql`select t.id from producer_tasks t join producers p on p.id=t.producer_id where t.assignee_id=${data.sourceId} and t.status in ('pendiente','esperando') and (p.portfolio_kind<>'comisionista' or p.owner_user_id not in (${data.sourceId},${data.targetId}))`
    ).length
  )
    throw new Error("Reasigna las tareas de otras carteras antes de unificar esta cuenta.");
  await sql`update producers set attention_user_id=${data.targetId} where attention_user_id=${data.sourceId}`;
  await sql`update producer_tasks set assignee_id=${data.targetId},version=${randomUUID()},updated_at=now() where assignee_id=${data.sourceId} and status in ('pendiente','esperando')`;
  await sql`update producers set owner_user_id=${data.targetId},comisionista_name=${plan.target.display_name},updated_at=now() where owner_user_id in (${data.sourceId},${data.targetId})`;
  await sql`update producer_groups set owner_user_id=${data.targetId},comisionista_name=${plan.target.display_name},updated_at=now() where owner_user_id in (${data.sourceId},${data.targetId})`;
  await sql`update visits v set owner_user_id=${data.targetId} from producers p where p.id=v.producer_id and p.owner_user_id=${data.targetId}`;
  for (const p of plan.producers.filter((p) => p.owner_user_id === data.sourceId)) {
    await sql`insert into activity(id,producer_id,user_id,kind,message) values (${`act_${randomUUID()}`},${p.id},${actor.userId},'cuenta',${`Cuenta unificada: ${plan.source.display_name} (${plan.source.email}) → ${plan.target.display_name} (${plan.target.email}). Se conserva la autoría anterior.`})`;
  }
  await sql`update profiles set status='bloqueado',merged_into_user_id=${data.targetId} where user_id=${data.sourceId}`;
  await sql`insert into revoked_users(user_id,revoked_by,reason) values (${data.sourceId},${actor.userId},'cuenta unificada') on conflict(user_id) do update set revoked_by=excluded.revoked_by,reason=excluded.reason`;
  await sql`delete from "session" where "userId"=${data.sourceId}`;
  await writeAudit(
    sql,
    actor,
    "cuenta",
    data.sourceId,
    "unificar",
    { source: plan.source, target: plan.target, producers: plan.producers },
    {
      targetId: data.targetId,
      email: plan.target.email,
      transferred: plan.sourceCount,
      total: plan.producers.length,
    },
  );
  return { transferred: plan.sourceCount, total: plan.producers.length, email: plan.target.email };
}
