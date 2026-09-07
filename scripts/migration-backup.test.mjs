import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { generateKeyPairSync } from "node:crypto";
import {
  assertBackupRuntime, BACKUP_TABLES, collectBackup, decryptBackup, encryptBackup,
} from "../src/lib/backup-core.server.ts";
import { createIsolatedBackupDatabase, verifyBackupInMemory } from "./verify-migration-backup.mjs";

let db;
let migrations;
let snapshot;
const pair = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
const query = (text, params) => db.query(text, params);
const collect = (userId = "owner-test") => collectBackup(query, userId, migrations, {
  origin: "http://isolated.invalid", codeRevision: "synthetic-test",
});

before(async () => {
  ({ db, migrations } = await createIsolatedBackupDatabase());
  // Fictitious records exist solely in this test's in-memory database.
  await db.exec(`
    insert into "user" (id, name, email, "emailVerified") values
      ('owner-test','Gerencia ficticia','owner@test.invalid',true),
      ('agent-test','Comisionista ficticio','agent@test.invalid',true),
      ('blocked-test','Bloqueado ficticio','blocked@test.invalid',true),
      ('revoked-test','Revocado ficticio','revoked@test.invalid',true);
    insert into profiles(user_id,display_name,role,status) values
      ('owner-test','Gerencia ficticia','gerente','activo'),
      ('agent-test','Comisionista ficticio','comisionista','activo'),
      ('blocked-test','Bloqueado ficticio','gerente','bloqueado'),
      ('revoked-test','Revocado ficticio','gerente','activo');
    insert into revoked_users(user_id,reason) values ('revoked-test','test');
    insert into account(id,"accountId","providerId","userId",password,"updatedAt") values
      ('credential-test','owner-test','credential','owner-test','fictional-password-hash',now());
    insert into account(id,"accountId","providerId","userId","accessToken","updatedAt") values
      ('oauth-test','google-test','grok-google','agent-test','fictional-encrypted-oauth-token',now());
    insert into session(id,"expiresAt",token,"updatedAt","userId") values
      ('session-test','2027-01-01','fictional-session-token',now(),'owner-test');
    insert into verification(id,identifier,value,"expiresAt") values
      ('verification-test','fictional','fictional-secret','2027-01-01');
    insert into producer_groups(id,name,owner_user_id,comisionista_name,titular_producer_id) values
      ('group-test','Grupo ficticio','agent-test','Comisionista ficticio','producer-test');
    insert into producers(id,owner_user_id,comisionista_name,name,group_id,group_role,hectares,financing_mxn,notes) values
      ('producer-test','agent-test','Comisionista ficticio','Productor ficticio','group-test','titular',123.45,999999999999.99,'Comillas " y saltos\nde línea'),
      ('member-test','agent-test','Comisionista ficticio','Familiar ficticio','group-test','familiar',1,0,null);
    insert into producers(id,owner_user_id,comisionista_name,name,cycle,rejection_kind,hectares_requested) values
      ('old-cycle-test','agent-test','Comisionista ficticio','Otro ciclo ficticio','25-26','total',8.50);
    insert into documents(id,producer_id,doc_type,status) values
      ('doc-test','producer-test','analisis_suelo','no_hizo'),
      ('doc-member-test','member-test','ine','recibido');
    insert into visits(id,producer_id,owner_user_id,scheduled_at) values
      ('visit-test','producer-test','agent-test','2026-09-07T19:00:00-07:00');
    insert into activity(id,producer_id,user_id,kind,message) values
      ('activity-test','producer-test','agent-test','nota','Mensaje ficticio');
    insert into touches(id,producer_id,owner_user_id,channel,summary) values
      ('touch-test','producer-test','agent-test','llamada','Llamada ficticia');
    insert into office_people(id,name,phone) values ('office-test','Oficina ficticia','0000000000');
    insert into office_pings(id,person_id,person_name,kind,message,user_id) values
      ('ping-test','office-test','Oficina ficticia','cita','Invitación ficticia','agent-test');
    update app_lock set enabled=true,code_hash='fictional-code-hash';
    insert into announcements(id,author_user_id,author_name,body) values
      ('announcement-test','owner-test','Gerencia ficticia','Aviso ficticio');
  `);
  snapshot = await collect();
});
after(async () => { await db?.close(); });

test("all 17 tables, other cycles, passwords and relationships survive encryption and restoration", async () => {
  assert.equal(snapshot.tables.length, BACKUP_TABLES.length);
  const envelope = encryptBackup(snapshot, pair.publicKey);
  for (const secret of ["Productor ficticio", "fictional-password-hash", "fictional-session-token", "fictional-encrypted-oauth-token"]) {
    assert.ok(!envelope.includes(secret));
  }
  const decrypted = decryptBackup(envelope, pair.privateKey);
  assert.deepEqual(decrypted, snapshot);
  const counts = await verifyBackupInMemory(decrypted);
  assert.equal(counts.producers, 3);
  assert.equal(counts.account, 2);
  assert.equal(counts._migrations, 12);
  assert.ok(Object.values(counts).every((count) => count > 0));
  const rows = decrypted.tables.find((t) => t.name === "visits").rows;
  assert.match(rows[0], /2026-09-08T02:00:00\+00:00/);
  assert.match(decrypted.tables.find((t) => t.name === "producers").rows.join(""), /999999999999.99/);
});

test("missing, commission-only, blocked and revoked users cannot read a backup", async () => {
  for (const id of ["missing", "agent-test", "blocked-test", "revoked-test"]) {
    await assert.rejects(collect(id), /Solo una cuenta activa/);
  }
  assert.equal((await collect()).tables.length, 17);
});

test("backup is read-only and leaves every source row unchanged", async () => {
  const afterSnapshot = await collect();
  assert.deepEqual(afterSnapshot.tables, snapshot.tables);
  await db.query("begin isolation level repeatable read read only");
  try {
    await assert.rejects(db.query("delete from producers"), /read-only/i);
  } finally {
    await db.query("rollback");
  }
});

test("extra tables and unexpected migrations fail instead of producing an incomplete backup", async () => {
  await db.exec("create table unexpected_table (id text)");
  await assert.rejects(collect(), /estructuras distintas/);
  await db.exec("drop table unexpected_table");
  await db.query("insert into _migrations(name) values ('9999_unknown.sql')");
  await assert.rejects(collect(), /migraciones de la base/);
  await db.query("delete from _migrations where name='9999_unknown.sql'");
});

test("row-level security never silently exports a filtered table", async () => {
  await db.exec("create role backup_reader; grant usage on schema public to backup_reader; grant select on all tables in schema public to backup_reader; alter table producers enable row level security; set role backup_reader");
  try {
    await assert.rejects(collect(), /row-level security/i);
  } finally {
    await db.exec("reset role; alter table producers disable row level security");
  }
});

test("truncation, tampering and a different recovery key are rejected", () => {
  const encrypted = encryptBackup(snapshot, pair.publicKey);
  assert.throws(() => decryptBackup(encrypted.slice(0, -10), pair.privateKey));
  const modified = JSON.parse(encrypted);
  const bytes = Buffer.from(modified.ciphertext, "base64");
  bytes[0] ^= 1;
  modified.ciphertext = bytes.toString("base64");
  assert.throws(() => decryptBackup(JSON.stringify(modified), pair.privateKey));
  const other = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
  assert.throws(() => decryptBackup(encrypted, other.privateKey));
});

test("restoration rejects a missing table, mismatched schema and broken foreign key", async () => {
  const incomplete = structuredClone(snapshot);
  incomplete.tables.pop();
  await assert.rejects(verifyBackupInMemory(incomplete), /incompleto/);
  const wrongSchema = structuredClone(snapshot);
  wrongSchema.tables[0].columns[0].type = "integer";
  await assert.rejects(verifyBackupInMemory(wrongSchema), /Estructura incompatible/);
  const broken = structuredClone(snapshot);
  broken.tables.find((t) => t.name === "producers").rows = [];
  await assert.rejects(verifyBackupInMemory(broken), /foreign key/i);
});

test("preview, expired availability and invalid expiry fail closed", () => {
  const now = Date.parse("2026-09-07T20:00:00Z");
  assert.throws(() => assertBackupRuntime(false, "2026-09-14", now), /vista previa/);
  assert.throws(() => assertBackupRuntime(true, "2026-09-07", now), /ventana de respaldo/);
  assert.throws(() => assertBackupRuntime(true, "invalid", now), /ventana de respaldo/);
  assert.doesNotThrow(() => assertBackupRuntime(true, "2026-09-14", now));
});
