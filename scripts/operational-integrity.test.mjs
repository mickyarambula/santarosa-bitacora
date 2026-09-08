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
    "truncate office_people,office_pings; insert into producers(id,owner_user_id,comisionista_name,name) values('a','agent_a','Agente A','Persona A'),('b','agent_b','Agente B','Persona B'); insert into documents(id,producer_id,doc_type) values('da','a','ine'),('db','b','ine'); insert into office_people(id,name,phone) values('o','Oficina','6871234567'); insert into visits(id,producer_id,owner_user_id,scheduled_at) values('va','a','agent_a','2026-09-12T16:00:00Z'),('vb','b','agent_b','2026-09-12T17:00:00Z')",
  );
});
const rows = async (q) => (await h.db.query(q)).rows;
test("office support denies foreign visits and contradictory producer IDs without writing anything", async () => {
  for (const data of [{ visitId: "vb" }, { visitId: "va", producerId: "b" }])
    await assert.rejects(
      h.call("pingOffice", "agent_a", { personId: "o", kind: "invite", ...data }),
    );
  assert.equal((await rows("select * from office_pings")).length, 0);
  assert.equal((await rows("select * from activity")).length, 0);
});
test("preparing office WhatsApp never claims sending; confirmation is scoped and idempotent", async () => {
  const p = await h.call("pingOffice", "agent_a", { personId: "o", kind: "invite", visitId: "va" });
  assert.equal((await rows("select * from activity")).length, 0);
  await assert.rejects(h.call("confirmOfficePing", "agent_b", { id: p.pingId }));
  await h.call("confirmOfficePing", "agent_a", { id: p.pingId });
  await h.call("confirmOfficePing", "agent_a", { id: p.pingId });
  assert.equal((await rows("select * from activity")).length, 1);
});
test("archive preserves all children, drops from work lists and can be restored by management", async () => {
  await assert.rejects(h.call("deleteProducer", "agent_a", { id: "a" }));
  await h.call("deleteProducer", "agent_a", { id: "a", reason: "No continuará este ciclo" });
  assert.equal((await rows("select * from documents where producer_id='a'")).length, 1);
  assert.equal((await rows("select * from visits where producer_id='a'")).length, 1);
  assert.equal((await h.call("listProducers", "agent_a")).producers.length, 0);
  assert.equal((await h.call("listVisits", "agent_a", { range: "todas" })).visits.length, 0);
  assert.equal((await h.call("listNextActions", "agent_a")).stats.missing, 0);
  await assert.rejects(
    h.call("createTouch", "agent_a", { producerId: "a", channel: "llamada", outcome: "contesto" }),
    /archivada/,
  );
  await assert.rejects(h.call("restoreProducer", "agent_a", { id: "a", reason: "Ya continuará" }));
  await h.call("restoreProducer", "manager", { id: "a", reason: "Regresó a negociar" });
  assert.equal((await h.call("listProducers", "agent_a")).producers.length, 1);
});
test("commission cannot archive an authorized producer and account deletion cannot erase a portfolio", async () => {
  await h.db.exec("update producers set stage='habilitado' where id='a'");
  await assert.rejects(
    h.call("deleteProducer", "agent_a", { id: "a", reason: "No continuará" }),
    /gerencia/,
  );
  await assert.rejects(
    h.call("deleteMember", "manager", {
      userId: "agent_a",
      confirmName: "Agente A",
      wipeCartera: true,
    }),
    /no se borran/,
  );
  assert.equal((await rows("select * from producers where id='a'")).length, 1);
});
test("document exceptions require explanation and retain before/after history", async () => {
  await assert.rejects(h.call("setDocumentStatus", "manager", { id: "da", status: "no_aplica" }));
  await h.call("setDocumentStatus", "manager", {
    id: "da",
    status: "no_aplica",
    reason: "Excepción revisada de ensayo",
  });
  const audit = (await rows("select * from crm_audit"))[0];
  assert.equal(audit.before_data.status, "pendiente");
  assert.equal(audit.after_data.reason, "Excepción revisada de ensayo");
});
test("archive and document audit failures roll back their changes", async () => {
  h.failOn("insert into crm_audit");
  await assert.rejects(
    h.call("deleteProducer", "agent_a", { id: "a", reason: "Cambio de prueba" }),
  );
  assert.equal((await rows("select archived_at from producers where id='a'"))[0].archived_at, null);
  await assert.rejects(
    h.call("setDocumentStatus", "manager", {
      id: "da",
      status: "no_aplica",
      reason: "Cambio de prueba",
    }),
  );
  assert.equal((await rows("select status from documents where id='da'"))[0].status, "pendiente");
});
test("completed visit requires outcome and records one actual contact even if retried", async () => {
  await assert.rejects(h.call("setVisitStatus", "agent_a", { id: "va", status: "cumplida" }));
  await h.call("setVisitStatus", "agent_a", {
    id: "va",
    status: "cumplida",
    notes: "Recibí la identificación",
  });
  await h.call("setVisitStatus", "agent_a", {
    id: "va",
    status: "cumplida",
    notes: "Recibí la identificación",
  });
  assert.equal((await rows("select * from touches where visit_id='va'")).length, 1);
  assert.ok((await rows("select last_touch_at from producers where id='a'"))[0].last_touch_at);
});
test("contact needs result and an older contact does not replace the newest time", async () => {
  await assert.rejects(h.call("createTouch", "agent_a", { producerId: "a", channel: "whatsapp" }));
  await h.call("createTouch", "agent_a", {
    producerId: "a",
    channel: "llamada",
    outcome: "contesto",
    happenedAt: "2026-09-07T17:00:00Z",
  });
  await h.call("createTouch", "agent_a", {
    producerId: "a",
    channel: "correo",
    summary: "Correo anterior",
    happenedAt: "2026-09-06T17:00:00Z",
  });
  assert.equal(
    (await rows("select last_touch_channel from producers where id='a'"))[0].last_touch_channel,
    "llamada",
  );
});
test("closed files do not count in active KPIs and ordinary edits do not reset stage age", async () => {
  await h.db.exec(
    "update producers set stage='cerrado',hectares=12,financing_mxn=420000 where id='a'; update producers set stage_entered_at='2020-01-01T00:00:00Z' where id='b'; update producers set phone='6871111111',updated_at=now() where id='b'",
  );
  assert.equal((await h.call("getDashboard", "agent_a")).kpis.producers, 0);
  assert.equal(
    new Date(
      (await rows("select stage_entered_at from producers where id='b'"))[0].stage_entered_at,
    ).getUTCFullYear(),
    2020,
  );
});
test("Office only sees assigned documents, cannot operate commercial endpoints or grant exceptions", async () => {
  await h.db.exec(
    "insert into profiles(user_id,display_name,role,status,office_owner_ids) values('office','Oficina','oficina','activo',array['agent_a'])",
  );
  assert.equal((await h.call("listOfficeFiles", "office")).items.length, 1);
  await assert.rejects(h.call("getOfficeFile", "office", { id: "b" }));
  await assert.rejects(h.call("setDocumentStatus", "office", { id: "db", status: "validado" }));
  await h.call("setDocumentStatus", "office", { id: "da", status: "entregado" });
  await h.call("setDocumentStatus", "office", { id: "da", status: "validado" });
  await assert.rejects(
    h.call("setDocumentStatus", "office", {
      id: "da",
      status: "no_aplica",
      reason: "Excepción ajena",
    }),
  );
  for (const fn of [
    "getProducer",
    "listProducers",
    "exportExcel",
    "getDashboard",
    "setStage",
    "createTouch",
    "createVisit",
    "deleteProducer",
    "setMemberRole",
    "setLock",
    "getOfficeDigest",
  ])
    await assert.rejects(
      h.call(fn, "office", { id: "a", producerId: "a", stage: "habilitado" }),
      /Oficina/,
    );
  await h.db.exec("update profiles set office_owner_ids='{}' where user_id='office'");
  await assert.rejects(h.call("getOfficeFile", "office", { id: "a" }));
});
test("management without access-admin retains operations but cannot change roles or memberships", async () => {
  await h.db.exec(
    "insert into profiles(user_id,display_name,role,status) values('supervisor','Gerencia operativa','gerente','activo')",
  );
  assert.equal((await h.call("listProducers", "supervisor")).producers.length, 2);
  for (const fn of [
    "setLock",
    "setMemberRole",
    "setMemberStatus",
    "deleteMember",
    "setOfficeAssignments",
    "setAccessAdmin",
    "mergeAccounts",
  ])
    await assert.rejects(
      h.call(fn, "supervisor", { userId: "agent_a", role: "oficina", status: "bloqueado" }),
      /administración/,
    );
  await assert.rejects(
    h.call("setMemberRole", "manager", { userId: "agent_a", role: "oficina" }),
    /Reasigna/,
  );
});
test("same-name accounts remain separate in identity filters and aggregates", async () => {
  await h.db.exec("update producers set comisionista_name='Jorge' ");
  const dash = await h.call("getDashboard", "manager");
  assert.equal(dash.agents.length, 2);
  const list = await h.call("listProducers", "manager", { agent: "uid:agent_a" });
  assert.equal(list.producers.length, 1);
  assert.equal(list.producers[0].ownerUserId, "agent_a");
  assert.equal((await h.call("getCartera", "manager")).agents.length, 2);
});

test("individual invitations are email-bound, single-use, revocable and never grant extra roles", async () => {
  await h.call("setLock", "manager", { enabled: true, code: "synthetic-lock" });
  const invite = await h.call("createTeamInvitation", "manager", { email: "invited@test.invalid" });
  const token = new URL("http://local" + invite.path).searchParams.get("invitacion");
  await h.db.exec(
    `insert into "user"(id,name,email,"emailVerified") values('invited','Invitado seguro','invited@test.invalid',false),('wrong','Otro invitado','wrong@test.invalid',false)`,
  );
  await assert.rejects(h.call("bootstrap", "wrong", { invitationToken: token }), /otro correo/);
  const p = await h.call("bootstrap", "invited", { invitationToken: token });
  assert.equal(p.profile.status, "activo");
  assert.equal(p.profile.role, "comisionista");
  assert.equal(p.profile.accessAdmin, false);
  assert.ok(
    (await rows("select claimed_at from team_invitations where email='invited@test.invalid'"))[0]
      .claimed_at,
  );
  const next = await h.call("createTeamInvitation", "manager", { email: "cancelled@test.invalid" });
  await h.call("revokeTeamInvitation", "manager", { id: next.id });
  await h.db.exec(
    `insert into "user"(id,name,email,"emailVerified") values('cancelled','Invitación cancelada','cancelled@test.invalid',false)`,
  );
  await assert.rejects(
    h.call("bootstrap", "cancelled", {
      invitationToken: new URL("http://local" + next.path).searchParams.get("invitacion"),
    }),
    /invitación/,
  );
  await assert.rejects(
    h.call("createTeamInvitation", "agent_a", { email: "no@test.invalid" }),
    /administración/,
  );
});
test("assignment changes are audited, immediately revoked and cannot target an unknown owner", async () => {
  await h.db.exec(
    "insert into profiles(user_id,display_name,role,status) values('office2','Expedientes','oficina','activo')",
  );
  await h.call("setOfficeAssignments", "manager", {
    userId: "office2",
    ownerIds: ["agent_b"],
    reason: "Apoyará esa cartera",
  });
  assert.deepEqual(
    (await h.call("listOfficeFiles", "office2")).items.map((p) => p.id),
    ["b"],
  );
  await assert.rejects(
    h.call("setOfficeAssignments", "manager", {
      userId: "office2",
      ownerIds: ["not-real"],
      reason: "Prueba de alcance",
    }),
  );
  await h.call("setOfficeAssignments", "manager", {
    userId: "office2",
    ownerIds: [],
    reason: "Terminó su revisión",
  });
  assert.equal((await h.call("listOfficeFiles", "office2")).items.length, 0);
});

test("closure requires a classified outcome and reopening clears it without losing its audit", async () => {
  const { producer } = await h.call("getProducer", "agent_a", { id: "a" });
  await assert.rejects(
    h.call("updateProducer", "agent_a", { ...producer, stage: "cerrado" }),
    /cierre/,
  );
  await h.call("setStage", "agent_a", {
    id: "a",
    stage: "cerrado",
    closeKind: "perdido",
    reason: "Eligió otro proveedor",
  });
  const { producer: closed } = await h.call("getProducer", "agent_a", { id: "a" });
  assert.equal(closed.closeKind, "perdido");
  await h.call("updateProducer", "agent_a", { ...closed, stage: "prospecto" });
  assert.equal((await rows("select close_kind from producers where id='a'"))[0].close_kind, null);
  assert.ok(
    (await rows("select * from crm_audit")).some((a) => a.after_data.closeKind === "perdido"),
  );
});
test("Office can record an observation while leaving a pending document pending", async () => {
  await h.db.exec(
    "insert into profiles(user_id,display_name,role,status,office_owner_ids) values('office','Oficina','oficina','activo',array['agent_a'])",
  );
  await h.call("setDocumentStatus", "office", {
    id: "da",
    status: "pendiente",
    reason: "La fotografía no es legible",
  });
  const d = (await rows("select status,notes from documents where id='da'"))[0];
  assert.equal(d.status, "pendiente");
  assert.equal(d.notes, "La fotografía no es legible");
  assert.equal((await rows("select * from crm_audit"))[0].after_data.reason, d.notes);
});
