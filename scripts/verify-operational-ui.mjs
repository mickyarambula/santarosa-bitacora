// Real email/password sessions, disposable localhost PGLite, fictitious people; external requests blocked.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
const browser = await chromium.launch({ headless: true });
const contexts = [];
const errors = [];
const stamp = Date.now();
const password = randomBytes(18).toString("base64url");
async function page() {
  const c = await browser.newContext({
    viewport: { width: 390, height: 844 },
    timezoneId: "Asia/Tokyo",
  });
  contexts.push(c);
  await c.route("**/*", (r) =>
    new URL(r.request().url()).hostname === "localhost" ? r.continue() : r.abort(),
  );
  const p = await c.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
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
const p = await page();
try {
  await signup(p, "Gerencia Operación", `management-${stamp}@test.invalid`);
  await p.goto("http://localhost:8081/productores/nuevo");
  await p.getByLabel("Productor / razón social", { exact: true }).fill(`Productor ensayo ${stamp}`);
  await p.getByLabel("Teléfono", { exact: true }).fill("6875551212");
  await p.getByLabel("Municipio", { exact: true }).selectOption("Guasave");
  await p.getByRole("button", { name: "Maíz blanco", exact: true }).click();
  await p.getByLabel("Hectáreas", { exact: true }).fill("12");
  await p
    .getByText("Borrador guardado en este dispositivo; falta guardar el productor.", {
      exact: true,
    })
    .waitFor();
  p.on("dialog", (d) => d.accept());
  await p.reload();
  await p.getByRole("button", { name: "Recuperar borrador" }).click();
  assert.equal(await p.getByLabel("Hectáreas", { exact: true }).inputValue(), "12");
  await p.getByRole("button", { name: "Continuar · servicio", exact: true }).click();
  await p.getByRole("button", { name: /Necesita habilitación/ }).click();
  await p.getByRole("checkbox", { name: /Revisé municipio/ }).check();
  await p.screenshot({ path: "/private/tmp/sr-captura-servicio.png", fullPage: true });
  await p.getByRole("button", { name: "Guardar productor", exact: true }).click();
  await p.waitForURL(/\/productores\/prd_/);
  const ficha = p.url();
  await p.getByRole("heading", { name: `Productor ensayo ${stamp}`, exact: true }).waitFor();
  await p.screenshot({ path: "/private/tmp/sr-ficha-compacta.png", fullPage: true });
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const wa = p.getByRole("link", { name: "WhatsApp", exact: true });
  await wa.evaluate((el) => el.addEventListener("click", (e) => e.preventDefault()));
  await wa.click();
  await p.getByRole("heading", { name: "Registrar resultado", exact: true }).waitFor();
  await p.getByRole("button", { name: "No se realizó · cerrar sin registrar" }).click();
  assert.equal(await p.getByText("WhatsApp · Contestó", { exact: true }).count(), 0);
  await p.getByRole("button", { name: "Registrar resultado", exact: true }).click();
  await p.getByLabel("¿Cómo quedó?", { exact: false }).selectOption("contesto");
  await p.getByLabel("Nota (opcional)").fill("Se acordó traer la identificación");
  await p.getByRole("button", { name: "Guardar en la bitácora" }).click();
  await p.getByRole("heading", { name: "¿Qué sigue con este productor?" }).waitFor();
  await p.getByRole("button", { name: "Terminar", exact: true }).click();
  await p
    .getByRole("link", { name: "Papelería", exact: true })
    .filter({ hasText: "Papelería" })
    .last()
    .click();
  await p
    .locator("#papeleria details")
    .filter({ hasText: "INE vigente" })
    .locator("summary")
    .click();
  assert.equal(await p.getByRole("button", { name: "No aplica", exact: true }).isEnabled(), false);
  await p
    .getByLabel("Observación o motivo (obligatorio para No aplica)")
    .first()
    .fill("Excepción ficticia para probar el recorrido");
  await p.getByRole("button", { name: "No aplica", exact: true }).click();
  await p
    .getByText("Observación: Excepción ficticia para probar el recorrido", { exact: true })
    .waitFor();
  await p.goto("http://localhost:8081/");
  await p.getByRole("heading", { name: "Qué sigue con los productores" }).waitFor();
  await p.screenshot({ path: "/private/tmp/sr-hoy-operativo.png", fullPage: true });
  const field = await page();
  await signup(field, "Campo Ensayo", `field-${stamp}@test.invalid`);
  await field.goto(ficha);
  await field.getByText("Este productor lo lleva otro comisionista.", { exact: true }).waitFor();
  await field.goto("http://localhost:8081/productores/nuevo");
  await field
    .getByLabel("Productor / razón social", { exact: true })
    .fill(`Campo productor ${stamp}`);
  await field.getByLabel("Municipio", { exact: true }).selectOption("Ahome");
  await field.getByRole("button", { name: "Sorgo", exact: true }).click();
  await field.getByLabel("Hectáreas", { exact: true }).fill("8");
  assert.equal(await field.getByLabel("Responsable de seguimiento", { exact: false }).count(), 0);
  await field.getByRole("button", { name: "Continuar · servicio", exact: true }).click();
  await field.getByRole("button", { name: /Solo entregará grano/ }).click();
  await field.getByRole("checkbox", { name: /Revisé municipio/ }).check();
  await field.getByRole("button", { name: "Guardar productor", exact: true }).click();
  await field.waitForURL(/\/productores\/prd_/);
  await field.getByRole("link", { name: "Papelería", exact: true }).last().click();
  await field
    .locator("#papeleria details")
    .filter({ hasText: "INE vigente" })
    .locator("summary")
    .click();
  assert.equal(await field.getByRole("button", { name: "Validado", exact: true }).count(), 0);
  await field.evaluate(() => window.scrollTo(0, 0));
  await field.screenshot({ path: "/private/tmp/sr-comisionista-ficha.png" });
  const office = await page();
  await signup(office, "Oficina Ensayo", `office-${stamp}@test.invalid`);
  await p.goto("http://localhost:8081/equipo");
  const row = p.getByRole("row").filter({ hasText: `office-${stamp}@test.invalid` });
  await row.locator("select").selectOption("oficina");
  await row.getByText("Carteras asignadas", { exact: true }).click();
  await row.getByRole("checkbox", { name: "Gerencia Operación", exact: true }).check();
  await row.getByLabel("Motivo del cambio").fill("Revisión documental de ensayo");
  await row.getByRole("button", { name: "Guardar carteras" }).click();
  await p.getByText("Permisos guardados con historial.").waitFor();
  await office.reload();
  await office.getByRole("heading", { name: "Oficina · Expedientes" }).waitFor();
  await office.getByRole("button", { name: new RegExp(`Productor ensayo ${stamp}`) }).click();
  await office.getByRole("heading", { name: `Productor ensayo ${stamp}`, exact: true }).waitFor();
  assert.equal(
    await office.getByRole("button", { name: "Definir próxima acción", exact: true }).count(),
    0,
  );
  assert.equal(await office.getByRole("button", { name: "No aplica", exact: true }).count(), 0);
  await office.screenshot({ path: "/private/tmp/sr-oficina-expedientes.png", fullPage: true });
  assert.ok(await office.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await p.goto(ficha);
  await p.getByText("Archivar ficha", { exact: true }).click();
  await p.getByLabel("Motivo", { exact: true }).fill("Archivo ficticio del ensayo");
  await p.getByRole("button", { name: "Confirmar archivo" }).click();
  await p.getByRole("status").filter({ hasText: "Ficha archivada: Archivo ficticio" }).waitFor();
  await p.getByText("Restaurar ficha", { exact: true }).click();
  await p.getByLabel("Motivo", { exact: true }).fill("Restauración de ensayo");
  await p.getByRole("button", { name: "Confirmar restauración" }).click();
  await p.getByRole("button", { name: "Definir próxima acción", exact: true }).waitFor();
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.screenshot({ path: "/private/tmp/sr-ficha-movil-final.png" });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: mobile capture and draft, explicit contact, exception reason, Office assignment and limited UI, archive/restore, no page errors or overflow.",
  );
} catch (e) {
  await p.screenshot({ path: "/private/tmp/sr-operacion-ui-failure.png", fullPage: true });
  console.error(e);
  process.exitCode = 1;
} finally {
  await Promise.all(contexts.map((c) => c.close()));
  await browser.close();
}
