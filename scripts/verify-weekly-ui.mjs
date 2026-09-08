// Local PGLite only. All external destinations (including WhatsApp) are blocked.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const auth = JSON.parse(readFileSync("/private/tmp/sr-office-test-auth.json", "utf8"));
const browser = await chromium.launch({ headless: true }),
  errors = [],
  contexts = [];
let active;
async function page(storageState, width = 390) {
  const c = await browser.newContext({
    storageState,
    viewport: { width, height: 844 },
    timezoneId: "Asia/Tokyo",
  });
  contexts.push(c);
  await c.route("**/*", (r) =>
    new URL(r.request().url()).hostname === "localhost" ? r.continue() : r.abort(),
  );
  const p = await c.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  p.setDefaultTimeout(15000);
  return p;
}
async function overflow(p) {
  assert(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    "Page overflows on mobile",
  );
}
try {
  const manager = await page(auth.manager),
    office = await page(auth.office),
    field = await page(auth.field);
  active = manager;
  await manager.goto("http://localhost:8081/");
  await manager.getByRole("heading", { name: "Preparar junta semanal", exact: true }).waitFor();
  await overflow(manager);
  await manager.screenshot({ path: "/private/tmp/sr-weekly-home-mobile.png", fullPage: true });
  await manager.goto("http://localhost:8081/junta");
  await manager.getByRole("table").waitFor();
  await overflow(manager);
  await manager.getByLabel("Cartera a revisar", { exact: true }).selectOption("empresa");
  const select = manager.getByLabel("Productor para el acuerdo", { exact: true });
  const id = await select.locator("option").nth(1).getAttribute("value");
  await select.selectOption(id);
  await manager.getByRole("button", { name: "Agregar tarea", exact: true }).click();
  await manager
    .getByLabel("Qué hay que hacer", { exact: true })
    .fill("Compromiso de junta ficticio");
  await manager
    .getByLabel("Fecha para atender · Sinaloa", { exact: true })
    .fill("2026-09-11T09:00");
  await manager.getByRole("button", { name: "Guardar tarea", exact: true }).click();
  await manager.getByText("Tarea guardada.", { exact: true }).waitFor();
  await manager.getByRole("button", { name: "2. Compromisos", exact: true }).click();
  await manager.getByText("Compromiso de junta ficticio", { exact: true }).first().waitFor();
  await manager
    .getByLabel("Acuerdos y apoyos de Gerencia", { exact: true })
    .fill("Junta de ensayo: Oficina revisará la documentación.");
  await manager.getByRole("button", { name: "Revisar cierre de junta", exact: true }).click();
  await manager
    .getByRole("button", { name: "Confirmar cierre y guardar resumen", exact: true })
    .click();
  await manager.getByText("Junta cerrada. El resumen queda guardado.", { exact: true }).waitFor();
  await manager.reload();
  await manager.getByRole("heading", { name: "Resumen de la junta", exact: true }).waitFor();
  await manager
    .getByText("Junta de ensayo: Oficina revisará la documentación.", { exact: true })
    .waitFor();
  await overflow(manager);
  await manager.screenshot({ path: "/private/tmp/sr-weekly-meeting-mobile.png", fullPage: true });
  await manager.setViewportSize({ width: 1365, height: 950 });
  await manager.screenshot({ path: "/private/tmp/sr-weekly-meeting-desktop.png", fullPage: true });
  active = office;
  await office.goto("http://localhost:8081/junta");
  await office.getByRole("heading", { name: "Resumen de la junta", exact: true }).waitFor();
  assert.equal(
    await office
      .getByRole("button", { name: "Confirmar cierre y guardar resumen", exact: true })
      .count(),
    0,
  );
  active = field;
  await field.goto("http://localhost:8081/junta");
  await field.getByLabel("Cartera a revisar", { exact: true }).waitFor();
  assert.equal(await field.getByRole("table").count(), 0);
  assert.equal(
    await field.getByRole("heading", { name: "Resumen de la junta", exact: true }).count(),
    0,
  );
  assert(!(await field.locator("body").innerText()).includes("Empresa ficticia"));
  await overflow(field);
  await field.screenshot({ path: "/private/tmp/sr-weekly-field-mobile.png", fullPage: true });
  active = manager;
  await manager.setViewportSize({ width: 390, height: 844 });
  await manager.goto("http://localhost:8081/avisos");
  await manager.getByRole("button", { name: "Mensajes a productores", exact: true }).click();
  await manager
    .getByText("No hay productores activos en esta etapa. Elige otra etapa.", { exact: true })
    .waitFor();
  assert(
    await manager
      .getByRole("button", { name: "Revisar mensaje y destinatarios", exact: true })
      .isDisabled(),
  );
  await manager.getByLabel("Etapa del productor", { exact: true }).selectOption("");
  await manager
    .getByLabel("Mensaje", { exact: true })
    .fill("Este es un recado ficticio. No se enviará.");
  await manager
    .getByRole("button", { name: "Revisar mensaje y destinatarios", exact: true })
    .click();
  await manager.getByRole("button", { name: "Guardar lista preparada", exact: true }).click();
  await manager.getByRole("heading", { name: "3. Enviar y confirmar", exact: true }).waitFor();
  assert(await manager.getByRole("button", { name: "Ya lo envié", exact: true }).isDisabled());
  const message = await manager
    .getByRole("link", { name: "Abrir WhatsApp", exact: true })
    .getAttribute("href");
  assert(message.startsWith("https://wa.me/"));
  assert(decodeURIComponent(message).includes("Gerencia Ensayo")); // Do not open the link.
  await overflow(manager);
  await manager.screenshot({ path: "/private/tmp/sr-weekly-broadcast-mobile.png", fullPage: true });
  await manager.getByRole("button", { name: "Omitir · no enviar", exact: true }).click();
  await manager
    .getByText(/1 cancelados o fallidos/)
    .first()
    .waitFor();
  await manager.reload();
  await manager.getByRole("button", { name: "Mensajes a productores", exact: true }).click();
  await manager.getByRole("button", { name: "Retomar lista", exact: true }).first().click();
  await manager.getByRole("heading", { name: "3. Enviar y confirmar", exact: true }).waitFor();
  await manager
    .getByText(/1 cancelados o fallidos/)
    .first()
    .waitFor();
  assert(await manager.getByRole("button", { name: "Ya lo envié", exact: true }).isDisabled());
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      ok: true,
      roles: 3,
      weeklySnapshot: true,
      agreementTask: true,
      scopeIsolation: true,
      broadcastResume: true,
      externalMessagesSent: 0,
      screenshots: "/private/tmp/sr-weekly-*.png",
    }),
  );
} catch (e) {
  if (active) {
    await active.screenshot({ path: "/private/tmp/sr-weekly-ui-failure.png", fullPage: true });
    console.error((await active.locator("body").innerText()).slice(-4500));
  }
  throw e;
} finally {
  await Promise.all(contexts.map((c) => c.close()));
  await browser.close();
}
