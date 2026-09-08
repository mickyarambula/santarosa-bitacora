import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import path from "node:path";
import makeHarness from "./test-support/crm-harness.cjs";
let h;
before(async () => {
  h = await makeHarness();
});
after(async () => h?.db.close());
beforeEach(async () => {
  await h.reset();
  await h.db.exec(
    "insert into profiles(user_id,display_name,role,status) values('office','Oficina ficticia','oficina','activo'),('manager2','Otra Gerencia','gerente','activo')",
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
const create = (name, actor = "agent_a", extra = {}) =>
  h.call("createProducer", actor, input(name, extra));
const day = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mazatlan" }).format(new Date());
const weekly = (actor = "manager", date = day()) => h.call("getWeeklyReport", actor, { date });
const rows = async (q, p = []) => (await h.db.query(q, p)).rows;
const prepare = async (body = "Recado de prueba", stage = "") => {
  const p = await h.call("previewBroadcast", "manager", { stage });
  const data = { id: randomUUID(), stage, body, expectedVersion: p.version };
  return { data, result: await h.call("prepareBroadcast", "manager", data) };
};
test("weekly boundaries use Sinaloa, Monday inclusive and next Monday exclusive", async () => {
  const { weekRange } = h.load(path.resolve("src/lib/weekly-dates.ts"));
  assert.deepEqual(weekRange("2026-09-13"), {
    key: "2026-09-07",
    lastDay: "2026-09-13",
    start: "2026-09-07T07:00:00.000Z",
    end: "2026-09-14T07:00:00.000Z",
  });
  assert.throws(() => weekRange("2026-02-30"));
  assert.throws(() => weekRange("bad"));
  const { id } = await create("Bordes");
  for (const [name, date] of [
    ["before", "2026-08-31T06:59:59Z"],
    ["start", "2026-08-31T07:00:00Z"],
    ["end", "2026-09-07T07:00:00Z"],
  ])
    await h.db.query(
      "insert into touches(id,producer_id,owner_user_id,channel,summary,happened_at) values($1,$2,'agent_a','llamada','Hecho',$3)",
      [name, id, date],
    );
  const r = await weekly("manager", "2026-09-01");
  assert.deepEqual(
    r.events.filter((e) => e.kind === "contacto").map((e) => e.id),
    ["start"],
  );
});
test("weekly scopes portfolios without attributing Office work to the commissioner", async () => {
  const a = await create("Cartera Uno"),
    b = await create("Cartera Dos", "agent_b");
  const company = await create("Productor Empresa", "office", { portfolioKind: "empresa" });
  await h.call("createTouch", "office", {
    producerId: a.id,
    channel: "llamada",
    summary: "Recibió los papeles",
  });
  await h.call("createTouch", "agent_b", {
    producerId: b.id,
    channel: "nota",
    summary: "Nota interna, no contacto",
  });
  const r = await weekly();
  const e = r.events.find((e) => e.kind === "contacto");
  assert.equal(e.portfolioId, "agent_a");
  assert.equal(e.actor, "Oficina ficticia");
  assert(r.producers.some((p) => p.id === company.id && p.portfolioId === "empresa"));
  const own = await weekly("agent_a");
  assert(own.events.every((e) => e.producerId === a.id));
  assert(own.producers.every((p) => p.id === a.id));
  assert.equal(own.closed, null);
  assert(!r.events.some((e) => e.kind === "contacto" && e.producerId === b.id));
  await assert.rejects(weekly("missing"));
  await h.db.exec("update profiles set status='bloqueado' where user_id='agent_a'");
  await assert.rejects(weekly("agent_a"));
});
test("drafts, failed messages and scheduled visits do not count as contacts or completed visits", async () => {
  const { id } = await create("Sin enviados", "agent_a", { phone: "6875551234" });
  await h.call("prepareCommunication", "agent_a", {
    id: "draft1",
    producerId: id,
    channel: "whatsapp",
    direction: "salida",
    destination: "6875551234",
    body: "Prueba",
  });
  const c = (await h.call("listCommunications", "agent_a", { producerId: id })).items[0];
  await h.call("confirmCommunication", "agent_a", {
    id: c.id,
    expectedVersion: c.version,
    status: "fallo",
    result: "No fue posible enviar",
  });
  await h.call("createVisit", "agent_a", {
    producerId: id,
    scheduledAt: day() + "T10:00",
    purpose: "Visita de prueba",
  });
  const r = await weekly();
  assert.equal(r.events.filter((e) => ["contacto", "visita"].includes(e.kind)).length, 0);
});
test("received documents and completed visits have actor and evidence; repeated status does not inflate", async () => {
  const { id } = await create("Evidencias");
  const doc = (await rows("select id from documents where producer_id=$1 limit 1", [id]))[0];
  await h.call("setDocumentStatus", "office", { id: doc.id, status: "entregado" });
  await h.call("setDocumentStatus", "office", { id: doc.id, status: "entregado" });
  const visit = await h.call("createVisit", "agent_a", {
    producerId: id,
    scheduledAt: day() + "T10:00",
    purpose: "Visita test",
  });
  await h.call("setVisitStatus", "agent_a", {
    id: visit.id,
    status: "cumplida",
    notes: "Productor aceptó continuar",
  });
  const r = await weekly();
  assert.equal(r.events.filter((e) => e.kind === "documento").length, 1);
  assert.equal(r.events.filter((e) => e.kind === "visita").length, 1);
});
test("closing preserves a complete immutable snapshot and rejects stale reports and non managers", async () => {
  const { id } = await create("Acuerdos");
  let r = await weekly();
  await h.call("saveProducerTask", "manager", {
    id: "agreement",
    producerId: id,
    title: "Traer identificación",
    assigneeId: "agent_a",
    dueAt: day() + "T12:00",
  });
  await assert.rejects(
    h.call("closeWeeklyMeeting", "manager", {
      date: day(),
      notes: "Acuerdos de prueba",
      expectedVersion: r.version,
    }),
    /cambios/,
  );
  r = await weekly();
  for (const actor of ["agent_a", "office"])
    await assert.rejects(
      h.call("closeWeeklyMeeting", actor, {
        date: day(),
        notes: "Acuerdos de prueba",
        expectedVersion: r.version,
      }),
      /Gerencia/,
    );
  const data = { date: day(), notes: "Oficina apoyará con documentos", expectedVersion: r.version };
  const closed = await h.call("closeWeeklyMeeting", "manager", data);
  assert.equal((await h.call("closeWeeklyMeeting", "manager", data)).id, closed.id);
  const snapshot = (await weekly()).closed.snapshot;
  assert(snapshot.tasks.some((t) => t.id === "agreement"));
  await h.call("createTouch", "agent_a", {
    producerId: id,
    channel: "llamada",
    summary: "Seguimiento después del cierre",
  });
  const next = await weekly();
  assert.equal(next.closed.snapshot.events.length, snapshot.events.length);
  assert(next.events.length > snapshot.events.length);
  assert.equal((await weekly("agent_a")).closed, null);
  await assert.rejects(
    h.call("closeWeeklyMeeting", "manager", { ...data, notes: "Sobrescribir acuerdos" }),
    /cerrada/,
  );
});
test("zero recipients and invalid phones are distinct and preparation is rejected without valid recipients", async () => {
  assert.equal(
    (await h.call("previewBroadcast", "manager", { stage: "papeleria" })).items.length,
    0,
  );
  await create("Sin teléfono");
  const p = await h.call("previewBroadcast", "manager", { stage: "" });
  assert.equal(p.items.length, 1);
  assert.equal(p.items[0].eligible, false);
  await assert.rejects(
    h.call("prepareBroadcast", "manager", {
      id: randomUUID(),
      stage: "",
      body: "Prueba",
      expectedVersion: p.version,
    }),
    /teléfono/,
  );
  assert.equal((await rows("select * from broadcast_batches")).length, 0);
});
test("preparation is atomic, idempotent, frozen and never creates contacts", async () => {
  const { id } = await create("Destinatario Uno", "agent_a", { phone: "6875551234" });
  await create("Excluido");
  const { data, result } = await prepare();
  assert.equal((await h.call("prepareBroadcast", "manager", data)).id, result.id);
  let b = await h.call("getBroadcast", "manager", { id: result.id });
  assert.equal(b.items.length, 1);
  assert.equal(b.items[0].status, "borrador");
  assert.match(b.items[0].body, /Gerencia prueba/);
  assert(!b.items[0].body.includes("Agente A de Almacenes"));
  await h.db.query("update producers set phone='6875554321',name='Nombre cambiado' where id=$1", [
    id,
  ]);
  b = await h.call("getBroadcast", "manager", { id: result.id });
  assert.equal(b.items[0].destination, "6875551234");
  assert.equal(b.items[0].producer_name, "Destinatario Uno");
  assert.equal((await rows("select * from touches")).length, 0);
  assert.equal((await weekly()).events.filter((e) => e.kind === "contacto").length, 0);
  assert.equal((await h.call("listBroadcasts", "manager")).items[0].pending, 1);
  for (const actor of ["agent_a", "office", "manager2"])
    await assert.rejects(h.call("getBroadcast", actor, { id: result.id }));
  await assert.rejects(h.call("prepareBroadcast", "manager", { ...data, body: "Otro texto" }));
});
test("review must be refreshed when recipients change; transaction rollback leaves no half-list", async () => {
  await create("Con teléfono", "agent_a", { phone: "6875551234" });
  const p = await h.call("previewBroadcast", "manager", { stage: "" });
  await create("Otro teléfono", "agent_b", { phone: "6875556789" });
  await assert.rejects(
    h.call("prepareBroadcast", "manager", {
      id: randomUUID(),
      stage: "",
      body: "Recado",
      expectedVersion: p.version,
    }),
    /cambiaron/,
  );
  h.failOn("insert into broadcast_recipients");
  await assert.rejects(prepare(), /INJECTED_WRITE_FAILURE/);
  h.failOn("");
  assert.equal((await rows("select * from broadcast_batches")).length, 0);
  assert.equal((await rows("select * from producer_communications")).length, 0);
});
test("manual confirmations survive reopening and retries, omissions are not contacts", async () => {
  await create("Destino uno", "agent_a", { phone: "6875551234" });
  await create("Destino dos", "agent_b", { phone: "6875556789" });
  const { result } = await prepare(),
    b = await h.call("getBroadcast", "manager", { id: result.id }),
    [one, two] = b.items;
  const send = {
    id: one.id,
    expectedVersion: one.version,
    status: "enviado_manual",
    result: "Enviado manualmente sin respuesta",
  };
  await h.call("confirmCommunication", "manager", send);
  await h.call("confirmCommunication", "manager", send);
  await h.call("confirmCommunication", "manager", {
    id: two.id,
    expectedVersion: two.version,
    status: "cancelado",
    result: "Omitido sin enviar el mensaje",
  });
  const list = await h.call("listBroadcasts", "manager");
  assert.equal(list.items[0].pending, 0);
  assert.equal(list.items[0].sent, 1);
  assert.equal(list.items[0].cancelled, 1);
  const r = await weekly();
  assert.equal(r.events.filter((e) => e.kind === "contacto").length, 1);
  assert.equal(
    (await h.call("getBroadcast", "manager", { id: result.id })).items.filter(
      (i) => i.status === "borrador",
    ).length,
    0,
  );
});

test("weekly navigation groups roles and distinguishes matching account names without merging", async () => {
  await h.db.exec(
    "update profiles set display_name='Nombre coincidente' where user_id in ('agent_a','agent_b')",
  );
  const r = await weekly();
  assert.equal(r.portfolios.find((p) => p.id === "office").role, "oficina");
  assert.equal(r.portfolios.find((p) => p.id === "manager").role, "gerente");
  const a = r.portfolios.find((p) => p.id === "agent_a"),
    b = r.portfolios.find((p) => p.id === "agent_b");
  assert.equal(a.name, b.name);
  assert(a.identity && b.identity && a.identity !== b.identity);
  const field = await weekly("agent_a");
  assert.deepEqual(
    field.portfolios.map((p) => p.id),
    ["agent_a"],
  );
});

test("weekly review filters keep zero activity and overdue work available, and restore URL state", async () => {
  const { portfolioSummaries, filterPortfolios, reviewSearch } = h.load(
    path.resolve("src/lib/weekly-review.ts"),
  );
  const r = await weekly();
  const items = portfolioSummaries(
    r.portfolios,
    [
      { portfolioId: "agent_a", producerId: "one" },
      { portfolioId: "agent_a", producerId: "one" },
    ],
    [{ portfolioId: "agent_b", status: "pendiente", dueAt: "2020-01-01T00:00:00Z" }],
    r.asOf,
  );
  assert.equal(items.find((p) => p.id === "agent_a").producers.size, 1);
  assert.deepEqual(
    filterPortfolios(items, { filter: "actividad" }).map((p) => p.id),
    ["agent_a"],
  );
  assert.deepEqual(
    filterPortfolios(items, { filter: "vencidos" }).map((p) => p.id),
    ["agent_b"],
  );
  assert(filterPortfolios(items, { filter: "sin-actividad" }).some((p) => p.id === "agent_b"));
  assert(!filterPortfolios(items, {}).some((p) => p.id === "manager"));
  assert(filterPortfolios(items, { group: "todos" }).some((p) => p.id === "manager"));
  assert.deepEqual(
    filterPortfolios(items, { group: "empresa" }).map((p) => p.id),
    ["empresa"],
  );
  const search = {
    date: "2026-09-08",
    portfolio: "agent_a",
    section: "compromisos",
    category: "vencidas",
    q: "Ángel",
    filter: "vencidos",
    group: "comisionistas",
    page: "1",
    view: "live",
  };
  assert.deepEqual(reviewSearch(search), { ...search, date: "2026-09-07", page: 1 });
  assert.deepEqual(
    reviewSearch({ date: "2026-02-30", section: "anything", group: "anything", page: -1 }),
    {},
  );
});

test("weekly movement links resolve real evidence and cannot expose another portfolio", async () => {
  const a = await create("Ficha de prueba enlace");
  const data = await h.call("getProducer", "agent_a", { id: a.id });
  await h.call("setDocumentStatus", "office", { id: data.documents[0].id, status: "recibido" });
  const r = await weekly();
  const e = r.events.find((e) => e.kind === "documento");
  assert.equal(e.actor, "Oficina ficticia");
  assert.equal(e.target, "documento-" + data.documents[0].id);
  const input = { date: day(), producerId: a.id, eventId: e.id };
  assert.deepEqual(await h.call("getWeeklyEvent", "agent_a", input), e);
  await assert.rejects(h.call("getWeeklyEvent", "agent_b", input), /no está disponible/);
  await assert.rejects(
    h.call("getWeeklyEvent", "agent_a", { ...input, producerId: "other" }),
    /no está disponible/,
  );
  await assert.rejects(
    h.call("getWeeklyEvent", "agent_a", { ...input, eventId: "missing" }),
    /no está disponible/,
  );
});
