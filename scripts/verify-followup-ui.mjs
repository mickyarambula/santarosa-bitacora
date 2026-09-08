// Local PGLite with real email/password auth. Synthetic people only; no external traffic.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
const browser = await chromium.launch({ headless: true });
const contexts = [];
const errors = [];
const stamp = Date.now(),
  password = randomBytes(18).toString("base64url");
async function newPage() {
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
}
let page;
try {
  page = await newPage();
  await signup(page, "Gerencia Ensayo", `manager-${stamp}@test.invalid`);
  await page.getByRole("heading", { name: "Gerencia Ensayo", exact: true }).waitFor();
  const skip = page.getByRole("button", { name: "Saltar", exact: true });
  if (await skip.isVisible()) await skip.click();
  await page.goto("http://localhost:8081/productores/nuevo");
  await page.getByRole("button", { name: "Guardar productor", exact: true }).waitFor();
  await page.getByLabel("Responsable de seguimiento", { exact: false }).selectOption({ index: 1 });
  await page
    .getByLabel("Productor / razón social", { exact: true })
    .fill(`Seguimiento QA ${stamp}`);
  await page.getByLabel("Hectáreas", { exact: true }).fill("12");
  await page.getByRole("button", { name: "Guardar productor", exact: true }).click();
  await page.waitForURL(/\/productores\/prd_/);
  const ficha = page.url();
  await page.getByRole("button", { name: "Definir próxima acción", exact: true }).click();
  await page.getByLabel("Qué sigue", { exact: true }).fill("Recoger INE");
  await page.getByLabel("Fecha y hora de seguimiento", { exact: true }).fill("2020-01-01T09:00");
  await page.getByRole("button", { name: "Guardar próxima acción", exact: true }).click();
  await page.getByRole("button", { name: "Cambiar seguimiento", exact: true }).waitFor();
  await page.goto("http://localhost:8081/");
  await page.getByText("1 con fecha vencida; confirma qué pasó.", { exact: true }).waitFor();
  await page.getByRole("link").filter({ hasText: "Recoger INE" }).click();
  await page.getByRole("button", { name: "Cambiar seguimiento", exact: true }).click();
  assert.equal(
    await page.getByLabel("Fecha y hora de seguimiento", { exact: true }).inputValue(),
    "2020-01-01T09:00",
  );
  await page.getByLabel("Fecha y hora de seguimiento", { exact: true }).fill("2030-01-01T11:30");
  await page
    .getByLabel("Motivo del cambio de seguimiento", { exact: true })
    .fill("Se acordó una nueva fecha");
  await page.getByRole("button", { name: "Guardar próxima acción", exact: true }).click();
  await page.getByRole("button", { name: "Marcar atendida", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Qué se hizo y cuál fue el resultado", exact: true })
    .fill("Se recibió y revisó la identificación");
  await page.getByRole("button", { name: "Guardar resultado", exact: true }).click();
  await page.getByRole("button", { name: "Definir próxima acción", exact: true }).waitFor();
  await page.reload();
  await page.getByText(/Acción atendida: Recoger INE/).waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: "/private/tmp/sr-proxima-accion-verificada.png", fullPage: true });
  const duplicate = await newPage();
  await signup(duplicate, "ING. GERENCIA ENSAYO", `duplicate-${stamp}@test.invalid`);
  await duplicate
    .getByRole("heading", { name: "Revisemos tu cuenta existente", exact: true })
    .waitFor();
  await duplicate.goto("http://localhost:8081/productores");
  await duplicate
    .getByRole("heading", { name: "Revisemos tu cuenta existente", exact: true })
    .waitFor();
  assert.equal(
    await duplicate.getByRole("button", { name: "Guardar productor", exact: true }).count(),
    0,
  );
  await duplicate.screenshot({
    path: "/private/tmp/sr-alta-duplicada-bloqueada.png",
    fullPage: true,
  });
  await page.goto("http://localhost:8081/equipo");
  await page.getByRole("button", { name: "Revisar coincidencia", exact: true }).click();
  await page
    .getByRole("heading", { name: "Revisar posible cuenta duplicada", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Confirmar persona distinta y habilitar", exact: true })
      .isDisabled(),
    true,
  );
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  assert.deepEqual(errors, []);
  console.log(
    "PASS: autenticación local real; alta coincidente sin acceso; revisión gerencial; acción vencida en Hoy; reprogramación con motivo; cierre con resultado e historial; horario Sinaloa desde Tokio; móvil sin desbordamiento.",
  );
} catch (e) {
  if (page) {
    await page.screenshot({ path: "/private/tmp/sr-followup-ui-failure.png", fullPage: true });
    console.error(await page.locator("body").innerText());
  }
  throw e;
} finally {
  await browser.close();
}
