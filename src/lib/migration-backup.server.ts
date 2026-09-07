import { Pool } from "pg";
import { assertBackupRuntime, BackupError, collectBackup, encryptBackup } from "./backup-core.server";
import { BACKUP_PUBLIC_KEY, BACKUP_EXPIRES_AT, BACKUP_CODE_REVISION } from "./backup-recipient.server";

export async function makeMigrationBackup(userId: string) {
  const connectionString = process.env.DATABASE_URL?.trim();
  assertBackupRuntime(Boolean(connectionString), BACKUP_EXPIRES_AT);
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 5000, query_timeout: 10000 });
  try {
    const client = await pool.connect();
    try {
      const paths = Object.keys(import.meta.glob("/migrations/*.sql", { query: "?raw", import: "default", eager: true }));
      const snapshot = await collectBackup(
        (text, params) => client.query(text, params), userId,
        paths.map((path) => path.split("/").pop()!),
        { origin: "https://crmsantarosa.grok.me", codeRevision: BACKUP_CODE_REVISION },
      );
      const encrypted = encryptBackup(snapshot, BACKUP_PUBLIC_KEY);
      return { encrypted, filename: `santarosa-${new Date().toISOString().replaceAll(":", "-")}.srbackup` };
    } finally {
      client.release();
    }
  } catch (error) {
    // Database/driver exceptions can contain row contents or connection details.
    if (error instanceof BackupError) throw new Error(error.message);
    throw new Error("No se pudo completar el respaldo. No se entregó un archivo parcial.");
  } finally {
    await pool.end();
  }
}
