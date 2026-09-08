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
  await h.db.exec(
    "insert into producers(id,owner_user_id,comisionista_name,name) values ('a','agent_a','Agente A','Persona A'),('b','agent_b','Agente B','Persona B'),('m','manager','Gerencia prueba','Persona M')",
  );
});
const plan = {
  producerId: "a",
  text: "Recoger INE",
  dueAt: "2026-09-12T09:00",
  expectedVersion: "",
};
const rows = async (q, p = []) => (await h.db.query(q, p)).rows;
test("planning stores Sinaloa time, owner and audit without inventing a visit or contact", async () => {
  await h.call("saveNextAction", "agent_a", plan);
  const a = await h.call("getNextAction", "agent_a", { producerId: "a" });
  assert.equal(a.dueAt, "2026-09-12T16:00:00.000Z");
  assert.equal(a.ownerName, "Agente A");
  assert.equal((await rows("select * from crm_audit"))[0].action, "programar");
  assert.equal((await rows("select * from visits")).length, 0);
  assert.equal((await rows("select * from touches")).length, 0);
  assert.equal((await rows("select stage from producers where id='a'"))[0].stage, "prospecto");
});
test("another commission cannot see, change or finish an action and cannot bypass the dashboard filter", async () => {
  await h.call("saveNextAction", "agent_a", plan);
  for (const fn of ["getNextAction", "saveNextAction", "finishNextAction"])
    await assert.rejects(h.call(fn, "agent_b", plan), /otro comisionista/);
  const list = await h.call("listNextActions", "agent_b", { agent: "Agente A" });
  assert.equal(list.items.length, 0);
  assert.equal(list.stats.missing, 1);
});
test("edits and closing require a fresh version and preserve the previous action and outcome", async () => {
  await h.call("saveNextAction", "agent_a", plan);
  let a = await h.call("getNextAction", "agent_a", { producerId: "a" });
  await assert.rejects(h.call("saveNextAction", "agent_a", { ...plan, text: "Cambiar" }), /cambió/);
  await assert.rejects(
    h.call("saveNextAction", "agent_a", { ...plan, expectedVersion: a.version }),
    /por qué/,
  );
  await h.call("saveNextAction", "manager", {
    ...plan,
    text: "Revisar superficie",
    dueAt: "2026-09-14T10:00",
    expectedVersion: a.version,
    reason: "Productor pidió nueva fecha",
  });
  const stale = a.version;
  a = await h.call("getNextAction", "agent_a", { producerId: "a" });
  await assert.rejects(
    h.call("finishNextAction", "agent_a", {
      producerId: "a",
      status: "atendida",
      outcome: "Terminado",
      expectedVersion: stale,
    }),
    /cambió/,
  );
  await h.call("finishNextAction", "agent_a", {
    producerId: "a",
    status: "atendida",
    outcome: "INE recibida y superficie revisada",
    expectedVersion: a.version,
  });
  const done = await h.call("getNextAction", "agent_a", { producerId: "a" });
  assert.equal(done.text, null);
  assert.equal(done.dueAt, null);
  assert.notEqual(done.version, "");
  const audit = await rows("select * from crm_audit order by created_at");
  assert.equal(audit.length, 3);
  assert.equal(audit[1].before_data.text, "Recoger INE");
  assert.equal(audit[2].after_data.outcome, "INE recibida y superficie revisada");
  await assert.rejects(
    h.call("finishNextAction", "agent_a", {
      producerId: "a",
      status: "atendida",
      outcome: "Otra vez",
      expectedVersion: a.version,
    }),
    /ya se atendió/,
  );
});
test("empty results, impossible dates and closed/older-cycle assignments are rejected", async () => {
  await assert.rejects(
    h.call("saveNextAction", "agent_a", { ...plan, dueAt: "2026-02-30T09:00" }),
    /fecha/,
  );
  await assert.rejects(h.call("saveNextAction", "agent_a", { ...plan, text: " " }), /acción/);
  await h.call("saveNextAction", "agent_a", plan);
  const a = await h.call("getNextAction", "agent_a", { producerId: "a" });
  await assert.rejects(
    h.call("finishNextAction", "agent_a", {
      producerId: "a",
      status: "atendida",
      outcome: "",
      expectedVersion: a.version,
    }),
    /resultado/,
  );
  await h.db.exec(
    "update producers set stage='cerrado' where id='a'; update producers set cycle='25-26' where id='b'",
  );
  await assert.rejects(
    h.call("saveNextAction", "agent_a", { ...plan, expectedVersion: a.version }),
    /abierta/,
  );
  await assert.rejects(h.call("saveNextAction", "agent_b", { ...plan, producerId: "b" }), /ciclo/);
  const list = await h.call("listNextActions", "manager", { view: "sin_accion" });
  assert.deepEqual(
    list.items.map((i) => i.id),
    ["m"],
  );
});
test("transaction failure restores the previous action and keeps last contact untouched", async () => {
  await h.call("saveNextAction", "agent_a", plan);
  const before = await h.call("getNextAction", "agent_a", { producerId: "a" });
  h.failOn("insert into crm_audit");
  await assert.rejects(
    h.call("finishNextAction", "agent_a", {
      producerId: "a",
      status: "cancelada",
      outcome: "Ya no hace falta",
      expectedVersion: before.version,
    }),
    /INJECTED/,
  );
  assert.deepEqual(await h.call("getNextAction", "agent_a", { producerId: "a" }), before);
  assert.equal(
    (await rows("select last_touch_at from producers where id='a'"))[0].last_touch_at,
    null,
  );
});
test("dashboard separates pending, overdue, missing and manager own portfolio", async () => {
  await h.call("saveNextAction", "agent_a", { ...plan, dueAt: "2020-01-01T10:00" });
  await h.call("saveNextAction", "manager", {
    ...plan,
    producerId: "m",
    dueAt: "2099-01-01T10:00",
  });
  const all = await h.call("listNextActions", "manager");
  assert.deepEqual(all.stats, { pending: 2, overdue: 1, missing: 1 });
  assert.equal(all.items[0].id, "a");
  const mine = await h.call("listNextActions", "manager", { agent: "__mine__" });
  assert.deepEqual(
    mine.items.map((i) => i.id),
    ["m"],
  );
  const missing = await h.call("listNextActions", "manager", { view: "sin_accion" });
  assert.deepEqual(
    missing.items.map((i) => i.id),
    ["b"],
  );
});
