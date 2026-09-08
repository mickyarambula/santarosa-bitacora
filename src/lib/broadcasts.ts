import { randomUUID, createHash } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import { requireProfile } from "./crm";
import { CYCLE, STAGES } from "./catalog";
import { whatsappHref } from "./utils";
import { writeAudit } from "./crm-audit";
import type { Profile } from "./types";
const stageInput = z
  .string()
  .refine(
    (s) => s === "" || STAGES.some((t) => t.id === s && t.id !== "cerrado"),
    "Elige una etapa activa.",
  );
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));
async function manager(sql: Sql, id: string) {
  const me = await requireProfile(sql, id, true);
  if (me.role !== "gerente")
    throw new Error("Solo Gerencia prepara mensajes al conjunto de productores.");
  return me;
}
async function targets(sql: Sql, stage: string) {
  const rows = await sql<{
    id: string;
    name: string;
    phone: string | null;
    portfolio: string;
  }>`select id,name,phone,comisionista_name as portfolio from producers where cycle=${CYCLE} and archived_at is null and not is_example and stage<>'cerrado' and coalesce(rejection_kind,'')<>'total' and (${stage}='' or stage=${stage}) order by name,id limit 501`;
  if (rows.length > 500)
    throw new Error(
      "Hay más de 500 destinatarios. Selecciona una etapa para preparar una lista más pequeña.",
    );
  const items = rows.map((p) => ({ ...p, eligible: !!whatsappHref(p.phone, "") }));
  return { items, version: createHash("sha256").update(JSON.stringify(items)).digest("hex") };
}
export const previewBroadcast = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d) => z.object({ stage: stageInput }).parse(d))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await manager(sql, context.userId);
    return targets(sql, data.stage);
  });
async function ownBatch(sql: Sql, me: Profile, id: string) {
  const b = (
    await sql<{
      id: string;
      author_id: string;
      body: string;
      stage: string | null;
    }>`select * from broadcast_batches where id=${id}`
  )[0];
  if (!b || b.author_id !== me.userId)
    throw new Error("Solo quien preparó esta lista puede retomarla.");
  return b;
}
export const prepareBroadcast = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d) =>
    z
      .object({
        id: z.string().uuid(),
        stage: stageInput,
        body: z.string().trim().min(1).max(4000),
        expectedVersion: z.string().length(64),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) =>
    (await getSql()).transaction(async (sql) => {
      const me = await manager(sql, context.userId);
      const exists = (
        await sql<{ id: string }>`select id from broadcast_batches where id=${data.id}`
      )[0];
      if (exists) {
        const b = await ownBatch(sql, me, data.id);
        if (b.body !== data.body || (b.stage ?? "") !== data.stage)
          throw new Error("La lista ya existe con otro mensaje.");
        return { id: data.id };
      }
      const list = await targets(sql, data.stage);
      if (list.version !== data.expectedVersion)
        throw new Error("Los destinatarios cambiaron. Actualiza la lista y vuelve a revisarla.");
      const valid = list.items.filter((t) => t.eligible);
      if (!valid.length) throw new Error("No hay destinatarios con teléfono válido.");
      await sql`insert into broadcast_batches(id,author_id,stage,body) values(${data.id},${me.userId},${data.stage || null},${data.body})`;
      for (const p of valid) {
        const id = randomUUID(),
          body = `Hola ${p.name}, le escribe ${me.displayName} de Almacenes Santa Rosa.\n\n${data.body}`;
        await sql`insert into producer_communications(id,producer_id,channel,direction,status,destination,body,created_by,version) values(${id},${p.id},'whatsapp','salida','borrador',${p.phone},${body},${me.userId},${randomUUID()})`;
        await sql`insert into broadcast_recipients(batch_id,communication_id,producer_name) values(${data.id},${id},${p.name})`;
      }
      await writeAudit(sql, me, "envio", data.id, "preparar", null, {
        stage: data.stage,
        body: data.body,
        recipients: valid.length,
        excluded: list.items.length - valid.length,
      });
      return { id: data.id };
    }),
  );
export const listBroadcasts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d) => z.object({ page: z.number().int().min(0).default(0) }).parse(d ?? {}))
  .handler(async ({ context, data }) => {
    const sql = await getSql(),
      me = await manager(sql, context.userId);
    const rows = await sql<{
      id: string;
      body: string;
      stage: string | null;
      created_at: string;
      total: number;
      pending: number;
      sent: number;
      cancelled: number;
    }>`select b.id,b.body,b.stage,b.created_at,count(c.id)::int as total,count(c.id) filter(where c.status='borrador')::int as pending,count(c.id) filter(where c.status='enviado_manual')::int as sent,count(c.id) filter(where c.status in ('cancelado','fallo'))::int as cancelled from broadcast_batches b left join broadcast_recipients r on r.batch_id=b.id left join producer_communications c on c.id=r.communication_id where b.author_id=${me.userId} group by b.id order by b.created_at desc,b.id limit 11 offset ${data.page * 10}`;
    return {
      hasMore: rows.length > 10,
      items: rows.slice(0, 10).map((b) => ({ ...b, createdAt: iso(b.created_at) })),
    };
  });
export const getBroadcast = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const sql = await getSql(),
      me = await manager(sql, context.userId),
      batch = await ownBatch(sql, me, data.id);
    const rows = await sql<{
      id: string;
      producer_id: string;
      producer_name: string;
      destination: string;
      body: string;
      status: string;
      version: string;
      result: string | null;
      available: boolean;
    }>`select c.id,c.producer_id,r.producer_name,c.destination,c.body,c.status,c.version,c.result,(p.archived_at is null and p.cycle=${CYCLE}) as available from broadcast_recipients r join producer_communications c on c.id=r.communication_id join producers p on p.id=c.producer_id where r.batch_id=${data.id} order by r.producer_name,c.id`;
    return { batch, items: rows };
  });
