// Disposable local CRM only. All requests outside localhost are blocked, including WhatsApp.
import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  timezoneId: "Asia/Tokyo",
});
await context.route("**/*", (route) =>
  new URL(route.request().url()).hostname === "localhost" ? route.continue() : route.abort(),
);
const page = await context.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (dialog) =>
  dialog.message().startsWith("¿Retirar") ? dialog.accept() : dialog.dismiss(),
);
const stamp = Date.now(),
  title = `Aviso prueba ${stamp}`,
  edited = `Aviso corregido ${stamp}`;
const fit = async () =>
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    "mobile overflow",
  );
try {
  await page.goto("http://localhost:8080/avisos");
  await page.getByRole("button", { name: "Publicar en Hoy", exact: true }).waitFor();
  const skip = page.getByRole("button", { name: "Saltar", exact: true });
  if (await skip.isVisible()) await skip.click();
  await page.getByPlaceholder("Título, ej. Esta semana INE y análisis de suelo").fill(title);
  await page.getByPlaceholder("El recado…").fill("Contenido original de prueba");
  await page.getByRole("button", { name: "Publicar en Hoy", exact: true }).click();
  let card = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  await card.getByRole("button", { name: "Editar", exact: true }).click();
  await card.getByLabel("Título", { exact: true }).fill(edited);
  await card
    .getByRole("textbox", { name: "Mensaje", exact: true })
    .fill("Contenido corregido de prueba");
  await card.getByLabel("Visible hasta (opcional)", { exact: true }).fill("2027-01-01T09:00");
  await card.getByRole("button", { name: "Guardar aviso", exact: true }).click();
  card = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: edited, exact: true }) });
  await card.getByRole("button", { name: "Retirar de Hoy", exact: true }).click();
  await card.waitFor({ state: "detached" });
  await page.getByRole("button", { name: "Historial / retirados", exact: true }).click();
  await card.getByRole("button", { name: "Historial", exact: true }).click();
  await card.getByText("Ver cambio de contenido", { exact: true }).click();
  await card
    .getByText("Antes: " + title + " — Contenido original de prueba", { exact: true })
    .waitFor();
  await fit();
  await page.screenshot({ path: "/private/tmp/sr-avisos-historial.png", fullPage: true });
  await card.getByRole("button", { name: "Restaurar", exact: true }).click();
  await card.waitFor({ state: "detached" });
  await page.getByRole("button", { name: "Vigentes", exact: true }).click();
  await card.getByRole("heading", { name: edited, exact: true }).waitFor();
  await page.reload();
  await card.getByRole("heading", { name: edited, exact: true }).waitFor();
  await page.goto("http://localhost:8080/productores/nuevo");
  await page.getByRole("button", { name: "Guardar productor", exact: true }).waitFor();
  await page.getByLabel("Responsable de seguimiento", { exact: false }).selectOption("dev-user");
  const producer = `Seguimiento prueba ${stamp}`;
  await page.getByLabel("Productor / razón social", { exact: true }).fill(producer);
  await page.getByLabel("Teléfono", { exact: true }).fill("668" + String(stamp).slice(-7));
  await page.getByLabel("Hectáreas", { exact: true }).fill("8");
  await page.getByRole("button", { name: "Guardar productor", exact: true }).click();
  await page.waitForURL(/\/productores\/prd_/);
  const ficha = page.url();
  await page.getByRole("heading", { name: producer, exact: true }).waitFor();
  // Producer details expose the existing visit form directly.
  await page.getByLabel("Cuándo", { exact: true }).fill("2026-09-10T19:00");
  await page.getByRole("button", { name: "Agendar visita", exact: true }).click();
  await page.getByRole("button", { name: "Reprogramar", exact: true }).click();
  const dialog = page.getByRole("dialog");
  assert.equal(await dialog.getByLabel("Cuándo", { exact: true }).inputValue(), "2026-09-10T19:00");
  await dialog.getByLabel("Cuándo", { exact: true }).fill("2026-09-11T09:30");
  await dialog
    .getByLabel("Motivo del cambio", { exact: true })
    .fill("Cambio solicitado por el productor");
  await dialog.getByRole("button", { name: "Guardar reprogramación", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  await page.getByText(/Cita reprogramada:.*Cambio solicitado/).waitFor();
  await fit();
  await page.screenshot({ path: "/private/tmp/sr-cita-trazabilidad.png", fullPage: true });
  await page.goto("http://localhost:8080/avisos");
  await page.getByRole("combobox", { name: /^Quiénes/ }).selectOption("");
  await page
    .getByPlaceholder("Ej. Esta semana ocupamos el análisis de suelo. Pásenlo a su comisionista.")
    .fill("Mensaje ficticio. No se envía al exterior.");
  await page.getByRole("button", { name: "Preparar envío", exact: true }).click();
  await page.getByRole("link", { name: "Abrir WhatsApp", exact: true }).waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Ya lo envié", exact: true }).isDisabled(),
    true,
  );
  const mutations = [];
  page.on("request", (r) => {
    if (r.method() === "POST") mutations.push(r.url());
  });
  await page.getByRole("link", { name: "Abrir WhatsApp", exact: true }).click();
  assert.equal(
    await page.getByRole("button", { name: "Ya lo envié", exact: true }).isEnabled(),
    true,
  );
  assert.equal(mutations.length, 0, "Opening WhatsApp must not write a CRM record");
  await page.getByRole("button", { name: "Ya lo envié", exact: true }).click();
  await page
    .getByRole("button", { name: "Ya lo envié", exact: true })
    .waitFor({ state: "hidden" })
    .catch(() => {});
  while (await page.getByRole("button", { name: "Omitir", exact: true }).isVisible())
    await page.getByRole("button", { name: "Omitir", exact: true }).click();
  await page.getByText(/^Marcaste como enviados 1 de /).waitFor();
  await page.goto(ficha);
  await page
    .getByText(/Envío confirmado manualmente; sin respuesta registrada/)
    .first()
    .waitFor();
  await page.goto("http://localhost:8080/equipo");
  await page.getByRole("button", { name: "Unificar cuentas duplicadas", exact: true }).click();
  await page.getByRole("heading", { name: "Una cuenta, una cartera", exact: true }).waitFor();
  await fit();
  await page.screenshot({ path: "/private/tmp/sr-unificar-cuentas.png", fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: móvil 390px; aviso publicar/editar/retirar/historial/restaurar; cita sin cambio de zona desde Tokio; WhatsApp no registra al abrir y requiere confirmación; unificación accesible. Tráfico externo bloqueado.",
  );
} catch (e) {
  await page.screenshot({ path: "/private/tmp/sr-trace-ui-failure.png", fullPage: true });
  console.error(await page.locator("body").innerText());
  throw e;
} finally {
  await browser.close();
}
