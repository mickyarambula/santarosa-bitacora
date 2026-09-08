// Disposable localhost PGLite only. External network blocked; no messages sent.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const browser = await chromium.launch({ headless: true }),
  contexts = [],
  errors = [];
const saved = "/private/tmp/sr-office-test-auth.json",
  stamp = Date.now(),
  password = randomBytes(18).toString("base64url");
let active;
async function page(storageState) {
  const c = await browser.newContext({
    viewport: { width: 390, height: 844 },
    timezoneId: "Asia/Tokyo",
    storageState,
  });
  contexts.push(c);
  await c.route("**/*", (r) =>
    new URL(r.request().url()).hostname === "localhost" ? r.continue() : r.abort(),
  );
  const p = await c.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("dialog", (d) => d.accept());
  return p;
}
async function signup(p, name, email) {
  await p.goto("http://localhost:8081/login");
  await p.locator("form button[type=submit]:not([disabled])").waitFor();
  await p.getByRole("button", { name: "Soy nuevo · crear cuenta", exact: true }).click();
  await p.getByRole("textbox", { name: "Nombre completo", exact: true }).fill(name);
  await p.getByPlaceholder("Correo", { exact: true }).fill(email);
  await p.getByPlaceholder("Contraseña", { exact: true }).fill(password);
  await p.getByPlaceholder("Confirma la contraseña", { exact: true }).fill(password);
  await p.getByRole("button", { name: "Crear cuenta", exact: true }).click();
  await p.waitForURL("http://localhost:8081/");
  await p.getByRole("heading", { name, exact: true }).waitFor();
  const skip = p.getByRole("button", { name: "Saltar", exact: true });
  if (await skip.isVisible()) await skip.click();
}
async function capture(p, name, kind, owner) {
  active = p;
  await p.goto("http://localhost:8081/productores/nuevo");
  const discard = p.getByRole("button", { name: "Descartar borrador" });
  if (await discard.isVisible()) await discard.click();
  await p.getByLabel("Cartera comercial", { exact: true }).selectOption(kind);
  if (owner)
    await p
      .getByLabel("Comisionista de la cartera", { exact: true })
      .selectOption({ label: owner });
  await p.getByLabel("Productor / razón social", { exact: true }).fill(name);
  await p.getByLabel("Teléfono", { exact: true }).fill("687" + String(Date.now()).slice(-7));
  await p.getByLabel("Municipio", { exact: true }).selectOption("Guasave");
  await p.getByRole("button", { name: "Maíz blanco", exact: true }).click();
  await p.getByLabel("Hectáreas", { exact: true }).fill("12");
  await p.getByRole("button", { name: "Continuar · servicio", exact: true }).click();
  await p.getByRole("button", { name: /Solo entregará grano/ }).click();
  await p.getByRole("checkbox", { name: /Revisé municipio/ }).check();
  await p.getByRole("button", { name: "Guardar productor", exact: true }).click();
  await p.waitForURL(/\/productores\/prd_/);
  await p.getByRole("heading", { name, exact: true }).waitFor();
  return p.url();
}
try {
  let manager, office, field;
  if (existsSync(saved)) {
    const a = JSON.parse(readFileSync(saved, "utf8"));
    manager = await page(a.manager);
    office = await page(a.office);
    field = await page(a.field);
  } else {
    manager = await page();
    active = manager;
    await signup(manager, "Gerencia Ensayo", `manager-${stamp}@test.invalid`);
    office = await page();
    active = office;
    await signup(office, "Oficina Ensayo", `office-${stamp}@test.invalid`);
    field = await page();
    active = field;
    await signup(field, "Campo Ensayo", `field-${stamp}@test.invalid`);
    active = manager;
    await manager.goto("http://localhost:8081/equipo");
    const row = manager.getByRole("row").filter({ hasText: `office-${stamp}@test.invalid` });
    await row.locator("select").selectOption("oficina");
    await manager.getByText("Rol actualizado.", { exact: true }).waitFor();
    writeFileSync(
      saved,
      JSON.stringify({
        manager: await manager.context().storageState(),
        office: await office.context().storageState(),
        field: await field.context().storageState(),
      }),
      { mode: 0o600 },
    );
  }
  const company = await capture(office, `Empresa ficticia ${stamp}`, "empresa");
  assert.match(await office.locator("#asignacion").innerText(), /Cartera de empresa/);
  assert.match(await office.locator("#asignacion").innerText(), /Capturó: Oficina Ensayo/);
  assert.match(await office.locator("#asignacion").innerText(), /Atiende: Oficina Ensayo/);
  await office.getByRole("button", { name: "Revisar asignación", exact: true }).click();
  assert.equal(
    await office.locator("#asignacion").getByLabel("Cartera comercial").isDisabled(),
    true,
  );
  await office.getByRole("button", { name: "Revisar asignación", exact: true }).click();
  await office.getByRole("button", { name: "Agregar tarea", exact: true }).click();
  await office.getByLabel("Qué hay que hacer", { exact: true }).fill("Revisar INE de ensayo");
  await office
    .getByLabel("Responsable de la tarea", { exact: true })
    .selectOption({ label: "Oficina Ensayo · oficina" });
  await office.getByLabel("Fecha para atender · Sinaloa", { exact: true }).fill("2026-09-10T09:00");
  await office.getByRole("button", { name: "Guardar tarea", exact: true }).click();
  await office.getByText("Tarea guardada.", { exact: true }).waitFor();
  await office.getByRole("button", { name: "Agregar tarea", exact: true }).click();
  await office
    .getByLabel("Qué hay que hacer", { exact: true })
    .fill("Esperar confirmación de ensayo");
  await office
    .getByLabel("Responsable de la tarea", { exact: true })
    .selectOption({ label: "Gerencia Ensayo · gerente" });
  await office.getByLabel("Fecha para atender · Sinaloa", { exact: true }).fill("2026-09-11T10:00");
  await office.getByLabel("Estado de la tarea", { exact: true }).selectOption("esperando");
  await office.getByRole("button", { name: "Guardar tarea", exact: true }).click();
  await office
    .locator("#seguimiento li")
    .filter({ hasText: "Esperar confirmación de ensayo" })
    .waitFor();
  assert.match(await office.locator("#seguimiento").innerText(), /9:00:00 a.m./);
  await office.locator("#comunicaciones > summary").click();
  await office.getByRole("button", { name: "Registrar comunicación", exact: true }).click();
  await office
    .getByLabel("Contenido exacto", { exact: true })
    .fill("Mensaje ficticio: confirmar entrega de identificación.");
  await office.getByRole("button", { name: "Guardar borrador", exact: true }).click();
  await office.getByText("Borrador · aún no se confirma envío", { exact: true }).waitFor();
  assert.equal(await office.getByText("Envío confirmado manualmente", { exact: true }).count(), 0);
  await office.getByRole("button", { name: "Confirmar qué ocurrió", exact: true }).click();
  await office
    .getByLabel("Qué ocurrió", { exact: true })
    .fill("Confirmación ficticia: ninguna comunicación externa fue enviada.");
  await office.getByRole("button", { name: "Guardar confirmación", exact: true }).click();
  await office.getByText("Envío confirmado manualmente", { exact: true }).waitFor();
  await office.locator("#bitacora > summary").click();
  await office.getByLabel("Tipo de movimiento", { exact: true }).selectOption("comunicacion");
  await office
    .locator("#bitacora")
    .getByText(/Envío confirmado por quien/)
    .waitFor();
  assert.match(await office.locator("#bitacora").innerText(), /Oficina Ensayo/);
  assert.ok(await office.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await office.screenshot({ path: "/private/tmp/sr-office-company-mobile.png", fullPage: true });
  active = field;
  await field.goto(company);
  await field
    .getByText(/otro comisionista|otra cartera|No puedes/)
    .first()
    .waitFor();
  const commissioned = await capture(
    office,
    `Productor de campo ${stamp}`,
    "comisionista",
    "Campo Ensayo",
  );
  await field.goto(commissioned);
  await field.getByRole("heading", { name: `Productor de campo ${stamp}`, exact: true }).waitFor();
  assert.match(await field.locator("#asignacion").innerText(), /Cartera: Campo Ensayo/);
  active = office;
  await office.goto("http://localhost:8081/productores/nuevo");
  await office
    .getByLabel("Buscar por nombre o teléfono", { exact: true })
    .fill(`Productor de campo ${stamp}`);
  await office.getByRole("button", { name: "Buscar expediente", exact: true }).click();
  await office.getByRole("link", { name: /Abrir expediente existente/ }).click();
  await office.getByRole("heading", { name: `Productor de campo ${stamp}`, exact: true }).waitFor();
  const pending = await capture(office, `Pendiente ficticio ${stamp}`, "pendiente");
  await office.getByRole("button", { name: "Revisar asignación", exact: true }).click();
  await office
    .locator("#asignacion")
    .getByLabel("Cartera comercial", { exact: true })
    .selectOption("empresa");
  await office
    .locator("#asignacion")
    .getByLabel("Persona de atención", { exact: true })
    .selectOption({
      label: (await office.locator("#asignacion option").allTextContents()).find((t) =>
        t.startsWith("Oficina Ensayo ·"),
      ),
    });
  await office
    .getByLabel("Motivo de la asignación", { exact: true })
    .fill("El productor confirmó su relación directa con la empresa");
  await office.getByRole("button", { name: "Guardar asignación", exact: true }).click();
  await office.getByText("Asignación guardada con historial.", { exact: true }).waitFor();
  await office.locator("#asignacion").getByText("Cartera de empresa", { exact: false }).waitFor();
  assert.match(await office.locator("#asignacion").innerText(), /Cartera de empresa/);
  active = manager;
  await manager.goto("http://localhost:8081/");
  await manager.getByLabel("Ver pendientes", { exact: true }).selectOption("esperando");
  await manager.getByLabel("Responsabilidad", { exact: true }).selectOption("mine");
  await manager.getByLabel("Buscar pendientes", { exact: true }).fill(`Empresa ficticia ${stamp}`);
  await manager
    .locator("form")
    .filter({ has: manager.getByLabel("Buscar pendientes") })
    .getByRole("button", { name: "Buscar", exact: true })
    .click();
  await manager.getByText("Esperar confirmación de ensayo", { exact: true }).waitFor();
  await manager.setViewportSize({ width: 1365, height: 900 });
  await manager.screenshot({ path: "/private/tmp/sr-office-inbox-desktop.png", fullPage: true });
  assert.ok(await manager.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
  console.log(
    "PASS: Office company and commissioner intake, pending assignment, ownership boundaries, two tasks, waiting inbox, manual communication without sending, filtered history, reception search, mobile and desktop without page errors.",
  );
  void pending;
} catch (e) {
  if (active) {
    await active.screenshot({ path: "/private/tmp/sr-office-ui-failure.png", fullPage: true });
    writeFileSync(
      "/private/tmp/sr-office-ui-failure.txt",
      await active.locator("body").innerText(),
    );
  }
  console.error(e);
  process.exitCode = 1;
} finally {
  await Promise.all(contexts.map((c) => c.close()));
  await browser.close();
}
