import {
  constants, createCipheriv, createDecipheriv, createHash, createPublicKey,
  privateDecrypt, publicEncrypt, randomBytes,
} from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";

// Ordered for foreign keys. Refuse unexpected tables instead of silently omitting them.
export const BACKUP_TABLES = [
  "user", "account", "session", "verification", "profiles", "producer_groups",
  "producers", "documents", "visits", "activity", "touches", "office_people",
  "office_pings", "app_lock", "revoked_users", "announcements", "_migrations",
] as const;
export type BackupTableName = (typeof BACKUP_TABLES)[number];
export type BackupQuery = (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
export type BackupColumns = { name: string; type: string; nullable: boolean }[];
export type BackupSnapshot = {
  format: "santarosa-data";
  version: 1;
  source: { origin: string; codeRevision: string; createdAt: string; exportedBy: string };
  migrations: string[];
  tables: { name: BackupTableName; columns: BackupColumns; rows: string[] }[];
};
const MAX_PLAIN_BYTES = 16 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 3 * 1024 * 1024;
const MAX_TABLE_ROWS = 50_000;

export class BackupError extends Error {}

export function assertBackupRuntime(databaseConfigured: boolean, expiresAt: string, now = Date.now()) {
  if (!databaseConfigured) throw new BackupError("Esta vista previa no contiene la base publicada. No se generó un respaldo.");
  const deadline = Date.parse(expiresAt);
  if (!Number.isFinite(deadline) || now >= deadline) {
    throw new BackupError("La ventana de respaldo terminó. Solicita una nueva preparación.");
  }
}

export function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

function sameNames(actual: string[], expected: readonly string[]) {
  return JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
}

export async function readBackupColumns(query: BackupQuery, table: string): Promise<BackupColumns> {
  const result = await query(`
    select a.attname as name, format_type(a.atttypid, a.atttypmod) as type,
           not a.attnotnull as nullable, a.attidentity, a.attgenerated
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = $1 and a.attnum > 0 and not a.attisdropped
    order by a.attnum`, [table]);
  if (!result.rows.length || result.rows.some((r) => r.attidentity || r.attgenerated)) {
    throw new BackupError("La estructura requiere una revisión antes de respaldar.");
  }
  return result.rows.map((r) => ({ name: String(r.name), type: String(r.type), nullable: r.nullable === true }));
}

/** Caller supplies one pinned connection, never Pool.query for a transaction. */
export async function collectBackup(
  query: BackupQuery,
  userId: string,
  expectedMigrations: string[],
  source: Pick<BackupSnapshot["source"], "origin" | "codeRevision">,
): Promise<BackupSnapshot> {
  await query("begin isolation level repeatable read read only");
  try {
    await query("set local statement_timeout = '8s'");
    await query("set local row_security = off");
    await query("set local timezone = 'UTC'");
    await query("set local datestyle = 'ISO, YMD'");
    // Do not use requireProfile/bootstrap: those may create profiles or merge producers.
    const access = await query(`
      select p.role, p.status from public.profiles p
      join public."user" u on u.id = p.user_id
      where p.user_id = $1 and not exists (
        select 1 from public.revoked_users r where r.user_id = p.user_id
      )`, [userId]);
    if (access.rows.length !== 1 || access.rows[0]?.role !== "gerente" || access.rows[0]?.status !== "activo") {
      throw new BackupError("Solo una cuenta activa de gerencia puede solicitar este respaldo.");
    }
    const tables = await query(`
      select c.relname as name, c.relkind
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p', 'f', 'S', 'm')`);
    if (!sameNames(tables.rows.map((r) => String(r.name)), BACKUP_TABLES) ||
        tables.rows.some((r) => r.relkind !== 'r')) {
      throw new BackupError("Hay tablas o estructuras distintas al código revisado. No se generó un respaldo parcial.");
    }
    const history = await query("select name from public._migrations order by name");
    const migrations = history.rows.map((r) => String(r.name));
    if (!sameNames(migrations, expectedMigrations)) {
      throw new BackupError("Las migraciones de la base no coinciden con esta versión del código.");
    }
    const timestamp = await query("select transaction_timestamp()::text as stamp");
    const snapshot: BackupSnapshot = {
      format: "santarosa-data", version: 1,
      source: { ...source, createdAt: String(timestamp.rows[0]?.stamp), exportedBy: userId },
      migrations, tables: [],
    };
    let bytes = 0;
    for (const name of BACKUP_TABLES) {
      const columns = await readBackupColumns(query, name);
      // JSON stays text, preserving Postgres numeric precision and timestamp values.
      const result = await query(`select row_to_json(t)::text as row from public.${quoteIdentifier(name)} t limit ${MAX_TABLE_ROWS + 1}`);
      if (result.rows.length > MAX_TABLE_ROWS) throw new BackupError("El volumen requiere otro método de respaldo.");
      const rows = result.rows.map((r) => String(r.row));
      bytes += rows.reduce((sum, row) => sum + Buffer.byteLength(row), 0);
      if (bytes > MAX_PLAIN_BYTES) throw new BackupError("El volumen requiere otro método de respaldo.");
      snapshot.tables.push({ name, columns, rows });
    }
    await query("commit");
    return snapshot;
  } catch (error) {
    await query("rollback");
    throw error;
  }
}

function fingerprint(publicKey: string) {
  return createHash("sha256").update(createPublicKey(publicKey).export({ type: "spki", format: "der" })).digest("hex");
}

/** The recipient is pinned in server code, not supplied by the requesting browser. */
export function encryptBackup(snapshot: BackupSnapshot, recipientPublicKey: string): string {
  const header = {
    format: "santarosa-encrypted", version: 1,
    algorithm: "RSA-OAEP-256+AES-256-GCM", recipient: fingerprint(recipientPublicKey),
  };
  const plain = Buffer.from(JSON.stringify(snapshot));
  if (plain.length > MAX_PLAIN_BYTES) throw new BackupError("El volumen requiere otro método de respaldo.");
  const key = randomBytes(32);
  const iv = randomBytes(12);
  try {
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from(JSON.stringify(header)));
    const ciphertext = Buffer.concat([cipher.update(gzipSync(plain)), cipher.final()]);
    const encryptedKey = publicEncrypt({ key: recipientPublicKey, oaepHash: "sha256", padding: constants.RSA_PKCS1_OAEP_PADDING }, key);
    const envelope = JSON.stringify({
      ...header, encryptedKey: encryptedKey.toString("base64"), iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64"),
    });
    if (Buffer.byteLength(envelope) > MAX_RESPONSE_BYTES) throw new BackupError("El volumen requiere otro método de respaldo.");
    return envelope;
  } finally {
    key.fill(0);
    plain.fill(0);
  }
}

/** Offline verification only. This function is never exposed as an HTTP handler. */
export function decryptBackup(envelope: string, privateKey: string): BackupSnapshot {
  if (Buffer.byteLength(envelope) > MAX_RESPONSE_BYTES) throw new BackupError("Archivo demasiado grande.");
  const data = JSON.parse(envelope);
  const { format, version, algorithm, recipient } = data;
  if (format !== "santarosa-encrypted" || version !== 1 || algorithm !== "RSA-OAEP-256+AES-256-GCM" ||
      recipient !== fingerprint(createPublicKey(privateKey).export({ type: "spki", format: "pem" }).toString())) {
    throw new BackupError("Archivo o llave incorrectos.");
  }
  const key = privateDecrypt({ key: privateKey, oaepHash: "sha256", padding: constants.RSA_PKCS1_OAEP_PADDING }, Buffer.from(data.encryptedKey, "base64"));
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(data.iv, "base64"));
    decipher.setAAD(Buffer.from(JSON.stringify({ format, version, algorithm, recipient })));
    decipher.setAuthTag(Buffer.from(data.tag, "base64"));
    const compressed = Buffer.concat([decipher.update(Buffer.from(data.ciphertext, "base64")), decipher.final()]);
    const snapshot = JSON.parse(gunzipSync(compressed, { maxOutputLength: MAX_PLAIN_BYTES }).toString("utf8"));
    validateBackup(snapshot);
    return snapshot;
  } finally {
    key.fill(0);
  }
}

export function validateBackup(snapshot: BackupSnapshot) {
  if (!snapshot || snapshot.format !== "santarosa-data" || snapshot.version !== 1 ||
      !Array.isArray(snapshot.tables) || !Array.isArray(snapshot.migrations) ||
      !sameNames(snapshot.tables.map((t) => t.name), BACKUP_TABLES)) {
    throw new BackupError("Respaldo incompleto o formato incompatible.");
  }
  for (const table of snapshot.tables) {
    if (!Array.isArray(table.columns) || !table.columns.length || !Array.isArray(table.rows) ||
        table.rows.length > MAX_TABLE_ROWS || table.rows.some((r) => typeof r !== "string")) {
      throw new BackupError("Respaldo incompleto o formato incompatible.");
    }
  }
}
