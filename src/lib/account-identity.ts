import { nameKey, phoneKey } from "./producer-match";
import type { Sql } from "./db";
export function accountNameKey(name: string) {
  return nameKey(name).replace(
    /^(?:(?:ing|ingeniero|ingeniera|lic|licenciado|licenciada|dr|dra|sr|sra)\s+)+/,
    "",
  );
}
export async function accountMatches(
  sql: Sql,
  userId: string,
  name: string,
  phone?: string | null,
) {
  const rows = await sql<{
    user_id: string;
    display_name: string;
    phone: string | null;
  }>`select user_id,display_name,phone from profiles where user_id<>${userId}`;
  const key = accountNameKey(name),
    tel = phoneKey(phone);
  return rows.filter(
    (r) => (key && accountNameKey(r.display_name) === key) || (tel && phoneKey(r.phone) === tel),
  );
}
