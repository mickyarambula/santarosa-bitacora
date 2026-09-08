import { randomUUID } from "node:crypto";
import type { Sql } from "./db";
export async function writeAudit(
  sql: Sql,
  actor: { userId: string; displayName: string },
  entityType: string,
  entityId: string,
  action: string,
  before: unknown,
  after: unknown,
) {
  await sql`insert into crm_audit(id,entity_type,entity_id,action,actor_user_id,actor_name,before_data,after_data)
    values (${`audit_${randomUUID()}`},${entityType},${entityId},${action},${actor.userId},${actor.displayName},${JSON.stringify(before)}::jsonb,${JSON.stringify(after)}::jsonb)`;
}
