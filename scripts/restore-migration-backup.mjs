#!/usr/bin/env node
// Restore only into an explicitly named, empty destination. Never overwrite a CRM.
import { readFile, readdir, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { createHash } from "node:crypto";
import pg from "pg";
import {
  backupTablesForMigrations,
  decryptBackup,
  quoteIdentifier,
  readBackupColumns,
} from "../src/lib/backup-core.server.ts";
import { verifyBackupInMemory } from "./verify-migration-backup.mjs";

export async function restoreIntoEmptyDatabase(client, snapshot, migrationFiles) {
  const selected = migrationFiles.filter((f) => snapshot.migrations.includes(f.name));
  if (JSON.stringify(selected.map((f) => f.name)) !== JSON.stringify(snapshot.migrations))
    throw new Error("Faltan las migraciones exactas del respaldo.");
  await client.query("begin");
  try {
    await client.query(
      "set local timezone = 'UTC'; set local datestyle = 'ISO, YMD'; set local statement_timeout = '30s'",
    );
    await client.query("select pg_advisory_xact_lock(73911653)");
    const existing = await client.query(
      "select tablename from pg_tables where schemaname = 'public'",
    );
    if (existing.rows.length) throw new Error("El destino no está vacío. No se sobrescribió.");
    await client.query(
      "create table _migrations (name text primary key, applied_at timestamptz not null default now())",
    );
    for (const { name, sql } of selected) {
      await client.query(sql);
      await client.query("insert into _migrations (name) values ($1)", [name]);
    }
    for (const table of snapshot.tables) {
      const columns = await readBackupColumns((sql, args) => client.query(sql, args), table.name);
      if (JSON.stringify(columns) !== JSON.stringify(table.columns))
        throw new Error("Estructura incompatible.");
    }
    // Only seed rows in the database created in this transaction are removed.
    await client.query("delete from app_lock; delete from _migrations");
    for (const name of backupTablesForMigrations(snapshot.migrations)) {
      const table = snapshot.tables.find((t) => t.name === name);
      for (const row of table.rows) {
        await client.query(
          `insert into public.${quoteIdentifier(name)} select * from json_populate_record(null::public.${quoteIdentifier(name)}, $1::json)`,
          [row],
        );
      }
    }
    const counts = {};
    for (const table of snapshot.tables) {
      const rows = (
        await client.query(
          `select row_to_json(t)::text as row from public.${quoteIdentifier(table.name)} t`,
        )
      ).rows
        .map((r) => r.row)
        .sort();
      if (JSON.stringify(rows) !== JSON.stringify([...table.rows].sort()))
        throw new Error("La recuperación no coincide.");
      counts[table.name] = rows.length;
    }
    // The old secret is not portable: invalidate sessions and broker tokens in
    // THIS new destination, after verifying the complete original snapshot.
    await client.query("delete from session; delete from verification");
    await client.query(`update account set "accessToken"=null, "refreshToken"=null, "idToken"=null,
      "accessTokenExpiresAt"=null, "refreshTokenExpiresAt"=null where "providerId" <> 'credential'`);
    await client.query("commit");
    return { countsBeforeSessionInvalidation: counts, sessionsAfter: 0, verificationAfter: 0 };
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

if (process.argv[1]?.endsWith("/restore-migration-backup.mjs")) {
  const [backupPath, keyPath, envPath, expectedHost, receiptPath] = process.argv.slice(2);
  let client;
  try {
    if (!receiptPath || !expectedHost?.endsWith(".neon.tech") || expectedHost.includes("-pooler"))
      throw new Error("Faltan argumentos de destino directo.");
    const env = parseEnv(await readFile(envPath, "utf8"));
    const url = new URL(env.DATABASE_URL_UNPOOLED);
    if (url.hostname !== expectedHost || env.NEON_PROJECT_ID !== "soft-sun-73911653")
      throw new Error("Destino diferente de Santa Rosa.");
    const bytes = await readFile(backupPath);
    const snapshot = decryptBackup(bytes.toString(), await readFile(keyPath, "utf8"));
    await verifyBackupInMemory(snapshot);
    const dir = new URL("../migrations/", import.meta.url);
    const names = (await readdir(dir)).filter((n) => /^\d+_.*\.sql$/.test(n)).sort();
    const files = await Promise.all(
      names.map(async (name) => ({ name, sql: await readFile(new URL(name, dir), "utf8") })),
    );
    client = new pg.Client({ connectionString: url.toString(), connectionTimeoutMillis: 10000 });
    await client.connect();
    const result = await restoreIntoEmptyDatabase(client, snapshot, files);
    const receipt = {
      restoredAt: new Date().toISOString(),
      destinationHost: expectedHost,
      sourceCreatedAt: snapshot.source.createdAt,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      ...result,
    };
    await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + "\n", {
      mode: 0o600,
      flag: "wx",
    });
    console.log(JSON.stringify(receipt, null, 2));
  } catch (error) {
    // Driver errors may contain personal data or credentials. Only expose code.
    console.error(
      "Restauración detenida; revisa destino vacío, versión y permisos.",
      error?.code ?? "VALIDATION",
    );
    process.exitCode = 1;
  } finally {
    await client?.end();
  }
}
