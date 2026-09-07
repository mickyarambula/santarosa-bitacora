#!/usr/bin/env node
/** Decrypt and restore ONLY into an in-memory PGlite database. No network destination. */
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import {
  BACKUP_TABLES, decryptBackup, quoteIdentifier, readBackupColumns, validateBackup,
} from "../src/lib/backup-core.server.ts";

const migrationsDir = new URL("../migrations/", import.meta.url);

export async function createIsolatedBackupDatabase() {
  const db = new PGlite();
  try {
    await db.waitReady;
    await db.exec("set timezone = 'UTC'; set datestyle = 'ISO, YMD'");
    await db.exec("create table _migrations (name text primary key, applied_at timestamptz not null default now())");
    const migrations = (await readdir(migrationsDir)).filter((name) => /^\d+_.*\.sql$/.test(name)).sort();
    for (const name of migrations) {
      await db.exec(await readFile(new URL(name, migrationsDir), "utf8"));
      await db.query("insert into _migrations (name) values ($1)", [name]);
    }
    return { db, migrations };
  } catch (error) {
    await db.close();
    throw error;
  }
}

/** Returns counts only; neither credentials nor decrypted rows are written to disk. */
export async function verifyBackupInMemory(snapshot) {
  validateBackup(snapshot);
  const { db, migrations } = await createIsolatedBackupDatabase();
  try {
    if (JSON.stringify([...snapshot.migrations].sort()) !== JSON.stringify(migrations)) {
      throw new Error("El respaldo necesita otra versión de las migraciones.");
    }
    const query = (text, params) => db.query(text, params);
    for (const table of snapshot.tables) {
      const targetColumns = await readBackupColumns(query, table.name);
      if (JSON.stringify(table.columns) !== JSON.stringify(targetColumns)) {
        throw new Error(`Estructura incompatible: ${table.name}`);
      }
    }
    await db.exec("begin");
    // This database was created above in memory; no existing database can be supplied.
    await db.exec("delete from app_lock; delete from _migrations");
    for (const name of BACKUP_TABLES) {
      const table = snapshot.tables.find((t) => t.name === name);
      for (const row of table.rows) {
        await db.query(`insert into public.${quoteIdentifier(name)} select * from json_populate_record(null::public.${quoteIdentifier(name)}, $1::json)`, [row]);
      }
    }
    const counts = {};
    for (const table of snapshot.tables) {
      const result = await db.query(`select row_to_json(t)::text as row from public.${quoteIdentifier(table.name)} t`);
      const restored = result.rows.map((r) => r.row).sort();
      if (JSON.stringify(restored) !== JSON.stringify([...table.rows].sort())) {
        throw new Error(`Los registros restaurados no coinciden: ${table.name}`);
      }
      counts[table.name] = restored.length;
    }
    const history = (await db.query("select name from _migrations order by name")).rows.map((r) => r.name);
    if (JSON.stringify(history) !== JSON.stringify(migrations)) throw new Error("Historial de migraciones inconsistente.");
    await db.exec("commit");
    return counts;
  } finally {
    await db.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [backupPath, privateKeyPath] = process.argv.slice(2);
  if (!backupPath || !privateKeyPath) {
    console.error("Uso: node --experimental-strip-types scripts/verify-migration-backup.mjs archivo.srbackup llave.pem");
    process.exitCode = 1;
  } else {
    try {
      const snapshot = decryptBackup(await readFile(backupPath, "utf8"), await readFile(privateKeyPath, "utf8"));
      const counts = await verifyBackupInMemory(snapshot);
      console.log("Respaldo descifrado y restaurado íntegramente en memoria. Ninguna base remota fue consultada.");
      console.log(JSON.stringify({ source: snapshot.source.origin, tables: counts }, null, 2));
    } catch {
      // SQL errors may contain row values: never print the exception here.
      console.error("No se pudo validar el respaldo. Revisa archivo, llave y versión del código; no se modificó ninguna base remota.");
      process.exitCode = 1;
    }
  }
}
