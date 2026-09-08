import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import makeHarness from "./test-support/crm-harness.cjs";

let h;
before(async () => {
  h = await makeHarness();
});
after(async () => h?.db.close());
beforeEach(async () => h.reset());
const input = (name, extra = {}) => ({
  name,
  businessUnit: "parafinanciero",
  scheme: "financiamiento",
  relation: "nuevo",
  zone: "Guasave",
  crop: "maiz_blanco",
  hectares: 100,
  yieldTonHa: 12,
  financingPerHa: 35000,
  financingMxn: 3500000,
  stage: "prospecto",
  ...extra,
});
const create = (name, extra = {}, actor = "agent_a") =>
  h.call("createProducer", actor, input(name, extra));
const rows = async (q, p = []) => (await h.db.query(q, p)).rows;

test("login and dashboard never merge names or erase producer notes", async () => {
  await h.db.query(
    "insert into producers(id,owner_user_id,comisionista_name,name,notes) values ('a','agent_a','Agente A','José Prueba','ejemplo ciclo 26-27'),('b','agent_b','Agente B','Jose Prueba',null)",
  );
  await h.call("bootstrap", "agent_b");
  await h.call("getDashboard", "agent_b");
  assert.equal((await rows("select * from producers")).length, 2);
});
test("shared phone cannot attach or expose another portfolio", async () => {
  const a = await create("Alfa", { phone: "6681112233" });
  await assert.rejects(
    create("Beta", { phone: "6681112233", newGroupName: "Grupo B" }, "agent_b"),
    /WhatsApp/,
  );
  assert.equal(
    (await rows("select group_id from producers where id=$1", [a.id]))[0].group_id,
    null,
  );
  assert.equal((await h.call("listGroups", "agent_b")).groups.length, 0);
});
test("a new group cannot reuse the phone of another existing group", async () => {
  await create("Alfa", { phone: "6681112233", newGroupName: "Grupo A" });
  await assert.rejects(
    create("Beta", { phone: "6681112233", newGroupName: "Grupo B" }),
    /WhatsApp/,
  );
});
test("explicit members of the same group can share a phone and retain their own papers", async () => {
  await create("Alfa", { phone: "6681112233", newGroupName: "Grupo A" });
  const groupId = (await rows("select id from producer_groups"))[0].id;
  await create("Beta", { phone: "6681112233", groupId });
  const g = (await h.call("listGroups", "agent_a")).groups[0];
  assert.equal(g.members, 2);
  assert.equal(g.producers.filter((p) => p.groupRole === "titular").length, 1);
  assert.equal((await rows("select * from documents")).length, 26);
});
test("read group members are scoped even if legacy data mixes owners", async () => {
  const a = await create("Alfa", { newGroupName: "Grupo A" });
  const b = await create("Beta", {}, "agent_b");
  const groupId = (await rows("select id from producer_groups"))[0].id;
  await h.db.query("update producers set group_id=$1 where id=$2", [groupId, b.id]);
  const d = await h.call("getProducer", "agent_a", { id: a.id });
  assert.equal(d.group.members, 1);
  assert.equal(d.roster.length, 1);
});
test("invalid group and mid-document failures roll back the entire capture", async () => {
  await assert.rejects(create("Alfa", { groupId: "missing" }), /grupo/);
  assert.equal((await rows("select * from producers")).length, 0);
  h.failOn("insert into documents");
  await assert.rejects(create("Beta"), /INJECTED/);
  h.failOn("");
  assert.equal((await rows("select * from producers")).length, 0);
  assert.equal((await rows("select * from documents")).length, 0);
});
test("concurrent repeated capture produces one ficha", async () => {
  const r = await Promise.allSettled([create("Alfa"), create("Alfa")]);
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal((await rows("select * from producers")).length, 1);
});
test("scheme change preserves shared status and dormant document rows on round trip", async () => {
  const p = await create("Alfa");
  await h.db.query("update documents set status='validado',notes='Revisado' where producer_id=$1", [
    p.id,
  ]);
  await h.call("updateProducer", "agent_a", {
    ...input("Alfa", { scheme: "cobertura_fira" }),
    id: p.id,
  });
  const d = await h.call("getProducer", "agent_a", { id: p.id });
  assert.equal(d.documents.length, 7);
  assert.equal(d.documents.find((d) => d.docType === "ine").status, "validado");
  await h.call("updateProducer", "agent_a", { ...input("Alfa"), id: p.id });
  const back = await h.call("getProducer", "agent_a", { id: p.id });
  assert.equal(back.documents.length, 13);
  assert.ok(back.documents.every((d) => d.status === "validado" && d.notes === "Revisado"));
});
test("management assigns to a real account, name spoofing cannot transfer a portfolio", async () => {
  const p = await create("Alfa", { ownerUserId: "agent_b" }, "manager");
  assert.equal((await h.call("listProducers", "agent_b")).producers[0].id, p.id);
  assert.equal(
    (await rows("select user_id from activity where producer_id=$1 and kind='alta'", [p.id]))[0]
      .user_id,
    "manager",
  );
  await assert.rejects(create("Beta", { ownerUserId: "agent_b" }), /Solo gerencia/);
  await create("Gamma", { comisionistaName: "Agente B" });
  assert.equal(
    (await rows("select owner_user_id from producers where name='Gamma'"))[0].owner_user_id,
    "agent_a",
  );
});
test("group reassignment transfers all members and visits together", async () => {
  const a = await create("Alfa", { newGroupName: "Grupo A" });
  const groupId = (await rows("select id from producer_groups"))[0].id;
  await create("Beta", { groupId });
  await h.call("createVisit", "manager", { producerId: a.id, scheduledAt: "2026-09-07T14:00" });
  await h.call("updateProducer", "manager", {
    ...input("Alfa", { ownerUserId: "agent_b", groupId }),
    id: a.id,
  });
  assert.equal((await h.call("listProducers", "agent_b")).producers.length, 2);
  assert.equal((await h.call("listVisits", "agent_b", { range: "todas" })).visits.length, 1);
  assert.equal((await h.call("listGroups", "agent_a")).groups.length, 0);
});
test("requested surface survives editing, partial rejection and reversal", async () => {
  const p = await create("Alfa");
  await h.call("updateProducer", "agent_a", { ...input("Alfa", { hectares: 150 }), id: p.id });
  await h.call("setRejection", "manager", {
    id: p.id,
    kind: "parcial",
    reason: "credito",
    hectaresAuthorized: 50,
  });
  await h.call("setRejection", "manager", { id: p.id, kind: "none" });
  const d = await h.call("getProducer", "agent_a", { id: p.id });
  assert.equal(d.producer.hectares, 150);
  assert.equal(d.producer.stage, "evaluacion");
});
test("removing a group titular repairs the remaining group", async () => {
  const a = await create("Alfa", { newGroupName: "Grupo A", groupRole: "titular" });
  const groupId = (await rows("select id from producer_groups"))[0].id;
  const b = await create("Beta", { groupId });
  await h.call("updateProducer", "agent_a", { ...input("Alfa"), id: a.id });
  const g = (await h.call("listGroups", "agent_a")).groups[0];
  assert.equal(g.titularProducerId, b.id);
  assert.equal(g.producers[0].groupRole, "titular");
});
test("only management validates documents, issues dictamen and authorizes completed files", async () => {
  const p = await create("Alfa");
  const doc = (await rows("select id from documents limit 1"))[0];
  await assert.rejects(
    h.call("setDocumentStatus", "agent_a", { id: doc.id, status: "validado" }),
    /Solo gerencia/,
  );
  await assert.rejects(
    h.call("setRejection", "agent_a", { id: p.id, kind: "total", reason: "credito" }),
    /Solo gerencia/,
  );
  await assert.rejects(
    h.call("setStage", "agent_a", { id: p.id, stage: "habilitado" }),
    /Solo gerencia/,
  );
  await assert.rejects(
    h.call("setStage", "manager", { id: p.id, stage: "habilitado" }),
    /documentos/,
  );
  await h.db.query("update documents set status='validado' where producer_id=$1", [p.id]);
  await h.call("setStage", "manager", { id: p.id, stage: "habilitado" });
  await assert.rejects(
    h.call("updateProducer", "agent_a", {
      ...input("Alfa", { hectares: 200, stage: "habilitado" }),
      id: p.id,
    }),
    /evaluación/,
  );
});
test("no_hizo remains listed as missing; dormant scheme documents are excluded", async () => {
  const p = await create("Alfa");
  await h.db.query("update documents set status='no_hizo' where doc_type='analisis_suelo'");
  let paper = await h.call("listPaperwork", "agent_a");
  assert.ok(paper.items[0].missing.some((d) => d.docType === "analisis_suelo"));
  await h.call("updateProducer", "agent_a", { ...input("Alfa", { scheme: "acopio" }), id: p.id });
  paper = await h.call("listPaperwork", "agent_a");
  assert.equal(paper.items[0].missing.length, 3);
});
test("other portfolio totals and edits are denied; all figures stay parameterized", async () => {
  const p = await create("Prueba O'Connor");
  assert.equal((await h.call("listTeam", "agent_b")).agents.length, 1);
  await assert.rejects(h.call("getProducer", "agent_b", { id: p.id }), /otro comisionista/);
  await assert.rejects(create("Mal dato", { stage: "inventada" }));
  await h.call("createVisit", "manager", { producerId: p.id, scheduledAt: "2026-09-07T14:00" });
  const v = (await h.call("listVisits", "agent_a", { range: "todas" })).visits[0];
  assert.equal(v.scheduledAt, "2026-09-07T21:00:00.000Z");
});

test("dashboard and reminders count only current paperwork, including no_hizo", async () => {
  const p = await create("Alfa", { stage: "papeleria" });
  await h.call("updateProducer", "agent_a", {
    ...input("Alfa", { scheme: "acopio", stage: "papeleria" }),
    id: p.id,
  });
  const dashboard = await h.call("getDashboard", "agent_a");
  assert.equal(dashboard.kpis.pendingDocs, 3);
  const paper = dashboard.attention.find((x) => x.kind === "papeleria");
  assert.match(paper.detail, /3 documentos/);
});
test("approved mandatory documents cannot be downgraded without returning to evaluation", async () => {
  const p = await create("Alfa");
  await h.db.query("update documents set status='validado' where producer_id=$1", [p.id]);
  await h.call("setStage", "manager", { id: p.id, stage: "habilitado" });
  const doc = (
    await rows("select id from documents where producer_id=$1 and doc_type='ine'", [p.id])
  )[0];
  await assert.rejects(
    h.call("setDocumentStatus", "manager", { id: doc.id, status: "pendiente" }),
    /evaluación/,
  );
  await h.call("setStage", "manager", { id: p.id, stage: "evaluacion" });
  await h.call("setDocumentStatus", "manager", { id: doc.id, status: "pendiente" });
});
test("regrouping cannot strand shared phones; failed regroup rolls back", async () => {
  const a = await create("Alfa", { newGroupName: "Grupo A", phone: "6681112233" });
  const groupId = (await rows("select id from producer_groups"))[0].id;
  await create("Beta", { groupId, phone: "6681112233" });
  const c = await create("Gamma");
  await assert.rejects(
    h.call("formGroupFromIds", "agent_a", { producerIds: [a.id, c.id], name: "Nuevo" }),
    /WhatsApp/,
  );
  assert.equal((await rows("select * from producer_groups")).length, 1);
  assert.equal(
    (await rows("select group_id from producers where id=$1", [a.id]))[0].group_id,
    groupId,
  );
});
test("group reassignment with shared phones preserves the complete group", async () => {
  const a = await create("Alfa", { newGroupName: "Grupo A", phone: "6681112233" });
  const groupId = (await rows("select id from producer_groups"))[0].id;
  await create("Beta", { groupId, phone: "6681112233" });
  await h.call("updateProducer", "manager", {
    ...input("Alfa", { groupId, phone: "6681112233", ownerUserId: "agent_b" }),
    id: a.id,
  });
  assert.equal((await h.call("listGroups", "agent_b")).groups[0].members, 2);
});
test("document repair is explicit: reading never writes, saving restores missing checklist rows", async () => {
  const p = await create("Alfa");
  await h.db.query("delete from documents where producer_id=$1 and doc_type='ine'", [p.id]);
  const detail = await h.call("getProducer", "agent_a", { id: p.id });
  assert.equal(detail.documents.length, 13);
  assert.equal(detail.documents.filter(d => d.missing).length, 1);
  assert.equal((await rows("select * from documents")).length, 12);
  await h.call("updateProducer", "agent_a", { ...input("Alfa"), id: p.id });
  assert.equal((await rows("select * from documents")).length, 13);
});
