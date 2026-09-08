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
    `delete from "user"; update profiles set display_name='Ing. Marco Romero',phone='6681112233' where user_id='agent_a'; insert into "user"(id,name,email,"emailVerified") values('new-user','  MARCO RÓMERO ','new@test.invalid',true);`,
  );
});
test("a different email with a matching name is blocked before capturing a second portfolio", async () => {
  const boot = await h.call("bootstrap", "new-user", { displayName: "A different client name" });
  assert.equal(boot.profile.status, "bloqueado");
  assert.equal(boot.profile.duplicateReview, true);
  await assert.rejects(h.call("listProducers", "new-user"), /LOCKED/);
  await assert.rejects(
    h.call("setMemberStatus", "manager", { userId: "new-user", status: "activo" }),
    /personas distintas/,
  );
  const again = await h.call("bootstrap", "new-user", {
    displayName: "Inventado",
    accessCode: "correct",
  });
  assert.equal(again.profile.status, "bloqueado");
});
test("management can document a true namesake exception but the commission cannot approve it", async () => {
  await h.call("bootstrap", "new-user");
  const data = {
    userId: "new-user",
    status: "activo",
    identityReviewReason: "Verificamos que son dos personas distintas con sus correos originales.",
  };
  await assert.rejects(h.call("setMemberStatus", "agent_b", data), /Solo gerencia/);
  await h.call("setMemberStatus", "manager", data);
  const boot = await h.call("bootstrap", "new-user");
  assert.equal(boot.profile.status, "activo");
  assert.equal(boot.profile.duplicateReview, false);
  const rows = (await h.db.query("select * from crm_audit where action='autorizar_homonimo'")).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].actor_user_id, "manager");
  assert.match(rows[0].after_data.reason, /distintas/);
});
test("new names and phones cannot silently introduce a duplicate through profile editing", async () => {
  await assert.rejects(
    h.call("updateMyProfile", "agent_b", { displayName: "Marco Romero" }),
    /coincide/,
  );
  await assert.rejects(
    h.call("updateMyProfile", "agent_b", { displayName: "Agente B", phone: "+52 668 111 2233" }),
    /coincide/,
  );
  await h.call("updateMyProfile", "agent_b", { displayName: "Otra persona", phone: "6689998877" });
});
test("existing duplicate profiles are not changed by this release or by login", async () => {
  await h.db.exec("update profiles set display_name='Ing Marco Romero' where user_id='agent_b'");
  const boot = await h.call("bootstrap", "agent_b");
  assert.equal(boot.profile.status, "activo");
  assert.equal(boot.profile.duplicateReview, false);
  const first = await h.call("bootstrap", "agent_a");
  assert.equal(first.profile.status, "activo");
});
test("concurrent registrations with matching identities create only one active portfolio", async () => {
  await h.db.exec(
    `delete from "user"; insert into "user"(id,name,email,"emailVerified") values('new-one','Persona Nueva','one@test.invalid',true),('new-two','PERSONA NUEVA','two@test.invalid',true);`,
  );
  const boots = await Promise.all([h.call("bootstrap", "new-one"), h.call("bootstrap", "new-two")]);
  assert.equal(boots.filter((b) => b.profile.status === "activo").length, 1);
  assert.equal(boots.filter((b) => b.profile.duplicateReview).length, 1);
});

test("a failed exception audit cannot enable a suspected duplicate", async () => {
  await h.call("bootstrap", "new-user");
  h.failOn("insert into crm_audit");
  await assert.rejects(
    h.call("setMemberStatus", "manager", {
      userId: "new-user",
      status: "activo",
      identityReviewReason: "Confirmamos personalmente que son personas diferentes.",
    }),
    /INJECTED/,
  );
  const boot = await h.call("bootstrap", "new-user");
  assert.equal(boot.profile.status, "bloqueado");
  assert.equal(boot.profile.duplicateReview, true);
});
