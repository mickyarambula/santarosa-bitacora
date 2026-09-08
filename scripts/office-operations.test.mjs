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
    "insert into profiles(user_id,display_name,role,status) values('office','Recepción','oficina','activo'),('office2','Revisión','oficina','activo')",
  );
});
const input = (name, extra = {}) => ({
  name,
  businessUnit: "directo",
  scheme: "acopio",
  crop: "maiz_blanco",
  stage: "prospecto",
  zone: "Guasave",
  relation: "nuevo",
  hectares: 10,
  yieldTonHa: 12,
  financingMxn: 0,
  ...extra,
});
const create = (name, kind = "empresa", extra = {}) =>
  h.call("createProducer", "office", input(name, { portfolioKind: kind, ...extra }));
const detail = (id) => h.call("getProducer", "office", { id });
const rows = async (q, p = []) => (await h.db.query(q, p)).rows;
const task = (id, p, extra = {}) => ({
  id,
  producerId: p,
  title: "Pedir papelería",
  assigneeId: "office",
  dueAt: "2026-09-09T09:00",
  ...extra,
});
const communication = (id, p, extra = {}) => ({
  id,
  producerId: p,
  channel: "whatsapp",
  direction: "salida",
  destination: "6875551111",
  body: "Traiga su identificación el viernes",
  ...extra,
});
test("company intake has no commissioner, retains its capturer, and is not a personal portfolio", async () => {
  const { id } = await create("Empresa Uno");
  const { producer: p } = await detail(id);
  assert.equal(p.ownerUserId, "");
  assert.equal(p.portfolioKind, "empresa");
  assert.equal(p.attentionUserId, "office");
  assert.equal(p.capturedBy, "office");
  assert.equal(p.intakeChannel, "oficina");
  assert.equal(p.businessUnit, "directo");
  assert.equal((await h.call("listProducers", "agent_a")).producers.length, 0);
  assert.equal(
    (await h.call("listTeam", "manager")).agents.find((p) => p.userId === "office").producers,
    0,
  );
  await assert.rejects(h.call("getProducer", "agent_a", { id }));
  await assert.rejects(
    h.call("createProducer", "agent_a", input("Empresa inválida", { portfolioKind: "empresa" })),
  );
});
test("Office captures for a commissioner and can attend it without transferring ownership", async () => {
  const { id } = await create("Cartera A", "comisionista", {
    ownerUserId: "agent_a",
    attentionUserId: "office2",
  });
  await h.call("createTouch", "office", {
    producerId: id,
    channel: "visita",
    summary: "Recibí al productor en oficina",
  });
  assert.equal((await detail(id)).producer.ownerUserId, "agent_a");
  assert.equal((await h.call("listProducers", "agent_a")).producers.length, 1);
  await assert.rejects(h.call("getProducer", "agent_b", { id }));
  await assert.rejects(
    h.call("updateProducer", "office", { ...(await detail(id)).producer, ownerUserId: "agent_b" }),
    /Asignación|cartera/,
  );
});
test("Office resolves pending assignments, but only management can move an established portfolio", async () => {
  const { id } = await create("Por identificar", "pendiente");
  const p = (await detail(id)).producer;
  await h.call("assignPortfolio", "office", {
    id,
    portfolioKind: "comisionista",
    ownerUserId: "agent_a",
    attentionUserId: "office",
    reason: "Identificó a su comisionista",
    expectedUpdatedAt: p.updatedAt,
  });
  const next = (await detail(id)).producer;
  assert.equal(next.capturedBy, "office");
  assert.equal(next.ownerUserId, "agent_a");
  await assert.rejects(
    h.call("assignPortfolio", "office", {
      id,
      portfolioKind: "empresa",
      attentionUserId: "office",
      reason: "Cambio sin autorización",
      expectedUpdatedAt: next.updatedAt,
    }),
    /Gerencia/,
  );
  await assert.rejects(
    h.call("assignPortfolio", "manager", {
      id,
      portfolioKind: "empresa",
      attentionUserId: "office",
      reason: "Cambio autorizado",
      expectedUpdatedAt: p.updatedAt,
    }),
    /cambió/,
  );
});
test("company groups preserve separate documents and shared phones and require explicit whole-group assignment", async () => {
  const a = await create("Persona Uno", "empresa", {
    newGroupName: "Grupo Uno",
    phone: "6875551234",
  });
  const groupId = (await detail(a.id)).producer.groupId;
  const b = await create("Persona Dos", "empresa", { groupId, phone: "6875551234" });
  assert.equal((await detail(a.id)).group.producers.length, 2);
  assert.notEqual((await detail(a.id)).documents[0].id, (await detail(b.id)).documents[0].id);
  const args = {
    id: a.id,
    portfolioKind: "comisionista",
    ownerUserId: "agent_a",
    attentionUserId: "agent_a",
    reason: "Grupo asignado a su comisionista",
    expectedUpdatedAt: (await detail(a.id)).producer.updatedAt,
  };
  await assert.rejects(h.call("assignPortfolio", "manager", args), /grupo/);
  await h.call("assignPortfolio", "manager", { ...args, confirmGroup: true });
  assert.equal((await h.call("listGroups", "agent_a")).groups[0].members, 2);
});
test("an established producer is found instead of duplicated when received by Office", async () => {
  await h.call("createProducer", "agent_a", input("Nombre existente", { phone: "6875552222" }));
  await assert.rejects(create("Nombre existente", "empresa", { phone: "6875552222" }));
  assert.equal((await rows("select * from producers")).length, 1);
});
test("company and pending portfolios remain distinct in filters and totals", async () => {
  await create("Empresa", "empresa");
  await create("Pendiente", "pendiente");
  const d = await h.call("getDashboard", "office");
  assert.equal(d.agents.length, 2);
  assert.equal((await h.call("getCartera", "office")).agents.length, 2);
  const names = await h.call("listAgentNames", "office");
  assert.deepEqual(names.agents.map((a) => a.id).sort(), [
    "Cartera de empresa",
    "Pendiente de asignar",
  ]);
  assert.equal(
    (await h.call("listProducers", "office", { agent: "Cartera de empresa" })).producers.length,
    1,
  );
});
test("two simultaneous tasks can have different responsible people and waiting dates", async () => {
  const { id } = await create("Tareas");
  await h.call("saveProducerTask", "office", task("t1", id));
  await h.call(
    "saveProducerTask",
    "office",
    task("t2", id, { assigneeId: "office2", status: "esperando" }),
  );
  const q = await h.call("listProducerTasks", "office", { producerId: id });
  assert.equal(q.items.length, 2);
  assert.equal(q.items[0].due_at, "2026-09-09T16:00:00.000Z");
  assert.equal(
    (await h.call("listWorkInbox", "office2", { view: "esperando", scope: "mine" })).items.length,
    1,
  );
  await assert.rejects(
    h.call("saveProducerTask", "office", task("bad", id, { assigneeId: "agent_a" })),
  );
  await assert.rejects(h.call("listProducerTasks", "agent_a", { producerId: id }));
});
test("task retries are idempotent, stale edits reject, results are mandatory and history survives", async () => {
  const { id } = await create("Reintentos");
  const data = task("t", id);
  await h.call("saveProducerTask", "office", data);
  await h.call("saveProducerTask", "office", data);
  const t = (await h.call("listProducerTasks", "office", { producerId: id })).items[0];
  assert.equal((await rows("select * from producer_tasks")).length, 1);
  await assert.rejects(
    h.call("saveProducerTask", "office", {
      ...data,
      title: "Otro",
      expectedVersion: "wrong",
      reason: "Cambió la tarea",
    }),
    /cambió/,
  );
  await h.call("saveProducerTask", "office", {
    ...data,
    title: "Revisar original",
    expectedVersion: t.version,
    reason: "La copia no es legible",
  });
  await assert.rejects(
    h.call("finishProducerTask", "office", {
      id: t.id,
      expectedVersion: t.version,
      status: "atendida",
      result: "Se recibió original",
    }),
    /cambió/,
  );
  const next = (await h.call("listProducerTasks", "office", { producerId: id })).items[0];
  await h.call("finishProducerTask", "office", {
    id: next.id,
    expectedVersion: next.version,
    status: "atendida",
    result: "Se recibió original",
  });
  assert.equal(
    (await h.call("listProducerTasks", "office", { producerId: id })).items[0].status,
    "atendida",
  );
});
test("portfolio transfer requires explicit handling of tasks whose commissioner loses access", async () => {
  const { id } = await create("Transferencia", "comisionista", { ownerUserId: "agent_a" });
  await h.call("saveProducerTask", "agent_a", task("t", id, { assigneeId: "agent_a" }));
  const args = {
    id,
    portfolioKind: "comisionista",
    ownerUserId: "agent_b",
    attentionUserId: "agent_b",
    reason: "Transferencia autorizada",
    expectedUpdatedAt: (await detail(id)).producer.updatedAt,
  };
  await assert.rejects(h.call("assignPortfolio", "manager", args), /tareas/);
  await h.call("assignPortfolio", "manager", { ...args, reassignOpenTasks: true });
  assert.equal(
    (await h.call("listProducerTasks", "agent_b", { producerId: id })).items[0].assignee_id,
    "agent_b",
  );
  await assert.rejects(h.call("listProducerTasks", "agent_a", { producerId: id }));
});
test("legacy next-action clients and new task clients share the same primary task without loss", async () => {
  const { id } = await h.call("createProducer", "agent_a", input("Anterior"));
  await h.call("saveNextAction", "agent_a", {
    producerId: id,
    text: "Visitar parcela",
    dueAt: "2026-09-09T09:00",
    expectedVersion: "",
  });
  const t = (await h.call("listProducerTasks", "agent_a", { producerId: id })).items[0];
  assert.equal(t.legacy_primary, true);
  await h.call("finishProducerTask", "agent_a", {
    id: t.id,
    expectedVersion: t.version,
    status: "atendida",
    result: "La parcela fue revisada",
  });
  assert.equal((await h.call("getNextAction", "agent_a", { producerId: id })).text, null);
});
test("linked visits and tasks complete once with one actual contact and matching reschedules", async () => {
  const { id } = await create("Con cita");
  const v = await h.call("createVisit", "office", {
    producerId: id,
    scheduledAt: "2026-09-09T09:00",
    purpose: "Recepción",
  });
  await h.call("saveProducerTask", "office", task("visit-task", id, { visitId: v.id }));
  await assert.rejects(
    h.call("saveProducerTask", "office", task("duplicate", id, { visitId: v.id })),
    /ya tiene/,
  );
  const data = { id: v.id, status: "cumplida", notes: "Se recibió la papelería" };
  await h.call("setVisitStatus", "office", data);
  await h.call("setVisitStatus", "office", data);
  assert.equal((await rows("select * from touches")).length, 1);
  assert.equal(
    (await h.call("listProducerTasks", "office", { producerId: id })).items[0].status,
    "atendida",
  );
});
test("communication drafts never claim contact, exact content is retained, only its author confirms", async () => {
  const { id } = await create("Mensaje");
  const data = communication("m", id);
  await h.call("prepareCommunication", "office", data);
  await h.call("prepareCommunication", "office", data);
  assert.equal((await detail(id)).producer.lastTouchAt, null);
  const c = (await h.call("listCommunications", "office", { producerId: id })).items[0];
  assert.equal(c.body, data.body);
  await assert.rejects(
    h.call("confirmCommunication", "office2", {
      id: c.id,
      expectedVersion: c.version,
      status: "enviado_manual",
      result: "Yo lo envié",
    }),
    /persona/,
  );
  await h.call("confirmCommunication", "office", {
    id: c.id,
    expectedVersion: c.version,
    status: "enviado_manual",
    result: "Enviado desde mi WhatsApp",
  });
  assert.ok((await detail(id)).producer.lastTouchAt);
  await assert.rejects(
    h.call("confirmCommunication", "office", {
      id: c.id,
      expectedVersion: c.version,
      status: "fallo",
      result: "Cambiar silenciosamente",
    }),
    /cambió/,
  );
  assert.equal(
    (await h.call("listCommunications", "office", { producerId: id })).items[0].body,
    data.body,
  );
});
test("failed or cancelled messages do not mark a successful contact; received messages are identified", async () => {
  const { id } = await create("Respuesta");
  await h.call("prepareCommunication", "office", communication("m", id));
  const c = (await h.call("listCommunications", "office", { producerId: id })).items[0];
  await h.call("confirmCommunication", "office", {
    id: "m",
    expectedVersion: c.version,
    status: "fallo",
    result: "El número no tiene WhatsApp",
  });
  assert.equal((await detail(id)).producer.lastTouchAt, null);
  await h.call(
    "prepareCommunication",
    "office",
    communication("in", id, { direction: "entrada", body: "Paso el viernes a entregar" }),
  );
  assert.equal(
    (await h.call("listCommunications", "office", { producerId: id })).items[0].status,
    "recibido",
  );
});
test("archive retains tasks and messages but removes daily work and rejects writes", async () => {
  const { id } = await create("Archivar");
  await h.call("saveProducerTask", "office", task("t", id));
  await h.call("prepareCommunication", "office", communication("m", id));
  await h.call("deleteProducer", "office", { id, reason: "No continúa este ciclo" });
  assert.equal((await h.call("listProducerTasks", "office", { producerId: id })).items.length, 1);
  assert.equal((await h.call("listCommunications", "office", { producerId: id })).items.length, 1);
  assert.equal(
    (await h.call("listWorkInbox", "office", { view: "pendientes", scope: "team" })).items.length,
    0,
  );
  await assert.rejects(
    h.call("prepareCommunication", "office", communication("new", id)),
    /archivada/,
  );
});
test("audit failures roll back portfolio assignments, task creation and communication confirmations", async () => {
  const { id } = await create("Rollback", "pendiente");
  await h.call("prepareCommunication", "office", communication("m", id));
  const c = (await h.call("listCommunications", "office", { producerId: id })).items[0];
  h.failOn("insert into crm_audit");
  await assert.rejects(
    h.call("assignPortfolio", "office", {
      id,
      portfolioKind: "empresa",
      attentionUserId: "office",
      reason: "Ya se identificó",
      expectedUpdatedAt: (await detail(id)).producer.updatedAt,
    }),
  );
  assert.equal((await detail(id)).producer.portfolioKind, "pendiente");
  await assert.rejects(h.call("saveProducerTask", "office", task("t", id)));
  assert.equal((await rows("select * from producer_tasks")).length, 0);
  await assert.rejects(
    h.call("confirmCommunication", "office", {
      id: "m",
      expectedVersion: c.version,
      status: "enviado_manual",
      result: "Confirmación de prueba",
    }),
  );
  assert.equal(
    (await h.call("listCommunications", "office", { producerId: id })).items[0].status,
    "borrador",
  );
});
test("inbox pages beyond one hundred and never exposes a different portfolio to a commissioner", async () => {
  const { id } = await h.call("createProducer", "agent_a", input("Muchos pendientes"));
  await h.db.query(
    "insert into producer_tasks(id,producer_id,title,assignee_id,due_at,created_by,version) select 'task-'||n,$1,'Pendiente '||n,'agent_a','2026-09-09','agent_a','v'||n from generate_series(1,110) n",
    [id],
  );
  const q = await h.call("listWorkInbox", "agent_a", {
    view: "pendientes",
    scope: "team",
    page: 4,
  });
  assert.equal(q.total, 110);
  assert.equal(q.items.length, 10);
  assert.equal(
    (await h.call("listWorkInbox", "agent_b", { view: "pendientes", scope: "team" })).items.length,
    0,
  );
});

test("reception finds formatted phone numbers and archived records without revealing them to field accounts", async () => {
  const { id } = await create("Recepción histórica", "empresa", { phone: "+52 (687) 555-1919" });
  assert.equal((await h.call("searchReception", "office", { q: "6875551919" })).items[0].id, id);
  await h.call("deleteProducer", "office", { id, reason: "Archivo de prueba" });
  assert.equal(
    (await h.call("searchReception", "office", { q: "Recepción" })).items[0].archived,
    true,
  );
  await assert.rejects(h.call("searchReception", "agent_a", { q: "Recepción" }));
});
test("history is searchable and paginated beyond the previous 200 rows, with actor identity and access checks", async () => {
  const { id } = await create("Historia larga");
  await h.db.query(
    "insert into activity(id,producer_id,user_id,kind,message) select 'history-'||n,$1,'office','tarea','Atención '||n from generate_series(1,230) n",
    [id],
  );
  const q = await h.call("listProducerHistory", "office", {
    producerId: id,
    page: 8,
    kind: "tarea",
  });
  assert.equal(q.total, 230);
  assert.equal(q.items.length, 25);
  assert.equal(q.items[0].actor, "Recepción");
  assert.equal(
    (await h.call("listProducerHistory", "office", { producerId: id, q: "Atención 230" })).items
      .length,
    1,
  );
  await assert.rejects(h.call("listProducerHistory", "agent_a", { producerId: id }));
});
test("a linked task cannot change its appointment date by omitting visitId, but rescheduling the visit updates it", async () => {
  const { id } = await create("Cita vinculada");
  const v = await h.call("createVisit", "office", {
    producerId: id,
    scheduledAt: "2026-09-09T09:00",
    purpose: "Recepción",
  });
  await h.call("saveProducerTask", "office", task("t", id, { visitId: v.id }));
  const t = (await h.call("listProducerTasks", "office", { producerId: id })).items[0];
  await assert.rejects(
    h.call(
      "saveProducerTask",
      "office",
      task("t", id, {
        dueAt: "2026-09-10T09:00",
        expectedVersion: t.version,
        reason: "Cambio de fecha",
      }),
    ),
    /fecha de la cita/,
  );
  await h.call("rescheduleVisit", "office", {
    id: v.id,
    scheduledAt: "2026-09-10T09:00",
    reason: "El productor pidió otro día",
    place: "Oficina",
    purpose: "Recepción",
    notes: "",
    expectedScheduledAt: "2026-09-09T16:00:00.000Z",
  });
  assert.equal(
    (await h.call("listProducerTasks", "office", { producerId: id })).items[0].due_at,
    "2026-09-10T16:00:00.000Z",
  );
});
test("reusing a draft identifier with a different destination cannot silently return success", async () => {
  const { id } = await create("Destinatario");
  await h.call("prepareCommunication", "office", communication("m", id));
  await assert.rejects(
    h.call("prepareCommunication", "office", communication("m", id, { destination: "6875552222" })),
    /otro contenido/,
  );
});
test("company edits preserve null ownership and cannot join a pending portfolio group", async () => {
  const a = await create("Empresa editada", "empresa", {
    phone: "6875553030",
    newGroupName: "Empresa grupo",
  });
  await h.call("updateProducer", "office", {
    ...(await detail(a.id)).producer,
    locality: "Ejido de prueba",
  });
  assert.equal((await detail(a.id)).producer.ownerUserId, "");
  const b = await create("Cartera pendiente", "pendiente", { newGroupName: "Grupo por asignar" });
  await assert.rejects(
    h.call("updateProducer", "office", {
      ...(await detail(a.id)).producer,
      groupId: (await detail(b.id)).producer.groupId,
    }),
  );
});
test("a blocked Office account cannot read or write the new operational endpoints", async () => {
  const { id } = await create("Acceso bloqueado");
  await h.db.exec("update profiles set status='bloqueado' where user_id='office'");
  for (const [method, data] of [
    ["listProducerTasks", { producerId: id }],
    ["listCommunications", { producerId: id }],
    ["listWorkInbox", {}],
    ["listProducerHistory", { producerId: id }],
    ["searchReception", { q: "Acceso" }],
    ["saveProducerTask", task("t", id)],
    ["prepareCommunication", communication("m", id)],
  ])
    await assert.rejects(h.call(method, "office", data));
});

test("reducing Office to field access requires reassigning company service and open tasks first", async () => {
  const { id } = await create("Cambio de rol");
  await h.call("saveProducerTask", "office", task("t", id, { assigneeId: "office2" }));
  await assert.rejects(
    h.call("setMemberRole", "manager", { userId: "office", role: "comisionista" }),
    /Reasigna/,
  );
  await assert.rejects(
    h.call("setMemberRole", "manager", { userId: "office2", role: "comisionista" }),
    /Reasigna/,
  );
  assert.equal(
    (await rows("select role from profiles where user_id='office2'"))[0].role,
    "oficina",
  );
});

test("merging duplicate company files preserves both task histories, messages and original authors", async () => {
  const a = await create("Ficha que queda"),
    b = await create("Ficha histórica");
  await h.call("saveProducerTask", "office", task("one", a.id));
  await h.call("saveProducerTask", "office2", task("two", b.id, { assigneeId: "office2" }));
  await h.call("prepareCommunication", "office2", communication("m", b.id));
  await h.call("resolveDuplicate", "manager", { keepId: a.id, dropIds: [b.id] });
  assert.equal((await h.call("listProducerTasks", "office", { producerId: a.id })).items.length, 2);
  const c = (await h.call("listCommunications", "office", { producerId: a.id })).items[0];
  assert.equal(c.actor, "Revisión");
  assert.equal(
    (await rows("select created_by from producer_tasks where id='two'"))[0].created_by,
    "office2",
  );
  assert.equal((await rows("select id from producers where id=$1", [b.id])).length, 0);
});
