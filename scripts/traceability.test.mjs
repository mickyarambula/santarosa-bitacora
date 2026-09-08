import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import makeHarness from "./test-support/crm-harness.cjs";
let h;
before(async () => {
  h = await makeHarness();
});
after(async () => h?.db.close());
beforeEach(async () => {
  await h.reset();
  await h.db
    .exec(`delete from "user"; insert into "user"(id,name,email,"emailVerified") values ('manager','Gerencia','manager@test.invalid',true),('agent_a','Duplicada','old@test.invalid',true),('agent_b','Conservada','keep@test.invalid',true);
 insert into account(id,"accountId","providerId","userId",password,"updatedAt") values ('old-password','agent_a','credential','agent_a','old-synthetic-hash',now()),('keep-password','agent_b','credential','agent_b','keep-synthetic-hash',now());
 insert into session(id,token,"userId","expiresAt","updatedAt") values ('old-session','old-token','agent_a','2030-01-01',now());
 insert into producers(id,owner_user_id,comisionista_name,name,hectares) values ('one','agent_a','Agente A','Persona uno',8),('two','agent_b','Agente B','Persona dos',100);
 insert into producer_groups(id,name,owner_user_id,comisionista_name,titular_producer_id) values ('group-one','Familia','agent_a','Agente A','one');
 update producers set group_id='group-one',group_role='titular' where id='one';
 insert into documents(id,producer_id,doc_type,status) values ('paper','one','ine','validado');
 insert into activity(id,producer_id,user_id,kind,message) values ('old-history','one','agent_a','nota','Historia original');
 insert into touches(id,producer_id,owner_user_id,channel,summary) values ('old-touch','one','agent_a','llamada','Llamada original');
 insert into visits(id,producer_id,owner_user_id,scheduled_at) values ('visit','one','agent_a','2026-09-08T02:00:00Z');`);
});
const rows = async (q, p = []) => (await h.db.query(q, p)).rows;
const merge = {
  sourceId: "agent_a",
  targetId: "agent_b",
  confirmEmail: "keep@test.invalid",
  expectedSourceCount: 1,
  expectedTargetCount: 1,
};
const notice = () =>
  h.call("postAnnouncement", "manager", {
    kind: "equipo",
    title: "Evento ficticio",
    body: "Primera versión",
  });
const visit = {
  id: "visit",
  scheduledAt: "2026-09-10T09:30",
  place: "Oficina",
  purpose: "Revisar papeles",
  notes: "Traer INE",
  reason: "El productor pidió otra fecha",
  expectedScheduledAt: "2026-09-08T02:00:00.000Z",
};

test("unification moves the portfolio and visits, preserving credentials, documents and original authors", async () => {
  const accounts = await rows("select * from account order by id");
  const papers = await rows("select * from documents");
  const result = await h.call("mergeAccounts", "manager", merge);
  assert.equal(result.total, 2);
  assert.equal(result.transferred, 1);
  assert.deepEqual(await rows("select * from account order by id"), accounts);
  assert.deepEqual(await rows("select * from documents"), papers);
  assert.equal((await rows("select sum(hectares)::int as ha from producers"))[0].ha, 108);
  assert.ok(
    (await rows("select * from producers")).every(
      (p) => p.owner_user_id === "agent_b" && p.comisionista_name === "Agente B",
    ),
  );
  assert.equal((await rows("select * from producer_groups"))[0].owner_user_id, "agent_b");
  assert.equal((await rows("select * from visits"))[0].owner_user_id, "agent_b");
  assert.equal((await rows("select * from activity where id='old-history'"))[0].user_id, "agent_a");
  assert.equal((await rows("select * from touches"))[0].owner_user_id, "agent_a");
  assert.equal((await rows('select * from "session"')).length, 0);
  assert.equal((await rows('select * from "user"')).length, 3);
  assert.equal((await rows("select * from crm_audit"))[0].action, "unificar");
  assert.equal(
    (await h.call("listTeam", "manager")).agents.filter((a) => a.userId === "agent_a").length,
    0,
  );
  assert.equal((await h.call("listProducers", "agent_b")).producers.length, 2);
  const history = await h.call("getProducer", "agent_b", { id: "one" });
  assert.equal(history.activity.find((a) => a.id === "old-history").actorName, "Agente A");
  await assert.rejects(h.call("getProducer", "agent_a", { id: "one" }), /LOCKED/);
  const boot = await h.call("bootstrap", "agent_a");
  assert.equal(boot.profile.mergedIntoEmail, "keep@test.invalid");
  assert.equal(boot.profile.status, "bloqueado");
  await assert.rejects(
    h.call("setMemberStatus", "manager", { userId: "agent_a", status: "activo" }),
    /unificada/,
  );
});
test("a failed audit write rolls back the entire unification including session invalidation", async () => {
  h.failOn("insert into crm_audit");
  await assert.rejects(h.call("mergeAccounts", "manager", merge), /INJECTED/);
  assert.equal(
    (await rows("select owner_user_id from producers where id='one'"))[0].owner_user_id,
    "agent_a",
  );
  assert.equal(
    (await rows("select status from profiles where user_id='agent_a'"))[0].status,
    "activo",
  );
  assert.equal((await rows('select * from "session"')).length, 1);
  assert.equal((await rows("select * from revoked_users")).length, 0);
});
test("only management can unify, with explicit email and a fresh review", async () => {
  for (const data of [
    { ...merge, confirmEmail: "wrong@test.invalid" },
    { ...merge, expectedSourceCount: 2 },
    { ...merge, targetId: "agent_a" },
  ])
    await assert.rejects(h.call("mergeAccounts", "manager", data));
  await assert.rejects(h.call("previewAccountMerge", "agent_a", merge), /Solo gerencia/);
  await assert.rejects(h.call("mergeAccounts", "agent_b", merge), /Solo gerencia/);
  assert.equal((await rows("select * from crm_audit")).length, 0);
});
test("consolidation refuses a group involving a third portfolio", async () => {
  await h.db.exec("update producer_groups set owner_user_id='manager' where id='group-one'");
  await assert.rejects(h.call("mergeAccounts", "manager", merge), /grupo con otra cartera/);
});
test("an announcement can be edited, retired and restored with content and actors retained", async () => {
  const { id } = await notice();
  const original = (await h.call("listAnnouncements", "manager")).items[0];
  await h.call("editAnnouncement", "manager", {
    id,
    title: "Nueva fecha",
    body: "Segunda versión",
    expectedUpdatedAt: original.updatedAt,
  });
  await assert.rejects(
    h.call("editAnnouncement", "manager", {
      id,
      title: "Obsoleto",
      body: "No sobrescribir",
      expectedUpdatedAt: original.updatedAt,
    }),
    /Otra persona/,
  );
  await h.call("archiveAnnouncement", "manager", { id, archive: true });
  assert.equal((await h.call("listAnnouncements", "agent_a")).items.length, 0);
  assert.equal(
    (await h.call("listAnnouncements", "manager", { includeHistory: true })).items[0].state,
    "retirado",
  );
  await h.call("archiveAnnouncement", "manager", { id, archive: false });
  assert.equal((await h.call("listAnnouncements", "agent_a")).items[0].body, "Segunda versión");
  const audit = (await h.call("getAnnouncementHistory", "manager", { id })).items;
  assert.equal(audit.length, 4);
  assert.ok(audit.every((a) => a.actor === "Gerencia prueba"));
  assert.equal(audit.find((a) => a.action === "editar").beforeBody, "Primera versión");
});
test("expiry hides the notice from Hoy without erasing it and blocks commission edits/history", async () => {
  const { id } = await h.call("postAnnouncement", "manager", {
    kind: "equipo",
    body: "Ya pasó",
    expiresAt: "2020-01-01T12:00",
  });
  assert.equal((await h.call("listAnnouncements", "manager")).items.length, 0);
  assert.equal(
    (await h.call("listAnnouncements", "manager", { includeHistory: true })).items[0].state,
    "vencido",
  );
  for (const [fn, data] of [
    ["archiveAnnouncement", { id, archive: true }],
    ["editAnnouncement", { id, title: "x", body: "x", expectedUpdatedAt: "" }],
    ["getAnnouncementHistory", { id }],
    ["listAnnouncements", { includeHistory: true }],
  ])
    await assert.rejects(h.call(fn, "agent_a", data), /Solo gerencia/);
});
test("announcement archive is atomic with its audit record", async () => {
  const { id } = await notice();
  h.failOn("insert into crm_audit");
  await assert.rejects(h.call("archiveAnnouncement", "manager", { id, archive: true }), /INJECTED/);
  assert.equal((await h.call("listAnnouncements", "agent_a")).items.length, 1);
});
test("rescheduling preserves visit identity and the old Sinaloa date with reason and actor", async () => {
  await h.call("rescheduleVisit", "agent_a", visit);
  const row = (await rows("select * from visits where id='visit'"))[0];
  assert.equal(row.scheduled_at.toISOString(), "2026-09-10T16:30:00.000Z");
  assert.equal(row.owner_user_id, "agent_a");
  const audit = (await rows("select * from crm_audit where entity_type='cita'"))[0];
  assert.equal(audit.actor_user_id, "agent_a");
  assert.equal(audit.after_data.reason, visit.reason);
  assert.match(audit.before_data.scheduled_at, /2026-09-08/);
  await assert.rejects(h.call("rescheduleVisit", "agent_a", visit), /ya fue reprogramada/);
});
test("visits reject unauthorized, closed, impossible or unexplained changes", async () => {
  await assert.rejects(h.call("rescheduleVisit", "agent_b", visit));
  await assert.rejects(h.call("rescheduleVisit", "agent_a", { ...visit, reason: "" }), /por qué/);
  await assert.rejects(
    h.call("rescheduleVisit", "agent_a", { ...visit, scheduledAt: "2026-02-30T09:00" }),
    /Fecha/,
  );
  await h.call("setVisitStatus", "agent_a", {
    id: "visit",
    status: "cumplida",
    notes: "Se atendió",
  });
  await assert.rejects(h.call("rescheduleVisit", "agent_a", visit), /cumplida o cancelada/);
});
test("renaming a profile updates portfolio labels without changing original actor IDs", async () => {
  await h.call("updateMyProfile", "agent_a", {
    displayName: "Nombre corregido",
    phone: "6681112233",
  });
  assert.equal(
    (await rows("select comisionista_name from producers where id='one'"))[0].comisionista_name,
    "Nombre corregido",
  );
  assert.equal(
    (await rows("select comisionista_name from producer_groups"))[0].comisionista_name,
    "Nombre corregido",
  );
  assert.equal(
    (await rows("select user_id from activity where id='old-history'"))[0].user_id,
    "agent_a",
  );
});

test("preparing a producer broadcast does not occupy the team notice feed", async () => {
  await notice();
  await h.call("postAnnouncement", "manager", {
    kind: "productores",
    title: "Lista privada",
    body: "Preparada, no enviada",
  });
  const feed = (await h.call("listAnnouncements", "manager")).items;
  assert.equal(feed.length, 1);
  assert.equal(feed[0].kind, "equipo");
});
