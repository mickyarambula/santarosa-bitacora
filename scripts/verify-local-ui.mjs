// Run against the disposable PGLite dev server with VITE_AUTH_ENABLED=false.
import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto("http://localhost:8080/productores/nuevo");
  await page.getByRole("button", { name: "Guardar productor", exact: true }).waitFor();
  if (await page.getByRole("button", { name: "Saltar", exact: true }).isVisible())
    await page.getByRole("button", { name: "Saltar", exact: true }).click();
  await page.getByLabel("Responsable de seguimiento", { exact: false }).selectOption("dev-user");
  assert.ok(
    !(await page.getByLabel("Etapa", { exact: true }).locator("option").allTextContents()).includes(
      "Habilitado",
    ),
  );
  const name = `Prueba local ${Date.now()}`;
  await page.getByLabel("Productor / razón social", { exact: true }).fill(name);
  await page.getByLabel("Hectáreas", { exact: true }).fill("10");
  await page.getByRole("button", { name: "Guardar productor", exact: true }).click();
  await page.waitForURL(/\/productores\/prd_/);
  await page.getByRole("heading", { name, exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Validado", exact: true }).count(), 13);
  await page.getByRole("button", { name: "Validado", exact: true }).first().click();
  await page
    .getByText("Documento actualizado.", { exact: true })
    .waitFor({ timeout: 10000 })
    .catch(() => {});
  await page.reload();
  await page.getByRole("heading", { name, exact: true }).waitFor();
  const document = page
    .locator("li")
    .filter({ has: page.getByRole("button", { name: "Validado", exact: true }) })
    .first();
  assert.equal(await document.locator("p").filter({ hasText: /^Validado$/ }).count(), 1);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: "/private/tmp/santarosa-ficha-verificada.png", fullPage: true });
  const manifest = await (
    await page.request.get("http://localhost:8080/__grok/manifest.webmanifest")
  ).json();
  assert.equal(manifest.name, "Santa Rosa");
  for (const icon of manifest.icons)
    assert.equal((await page.request.get(`http://localhost:8080${icon.src}`)).status(), 200);
  await page.goto("http://localhost:8080/?install=1&platform=ios");
  await page.getByRole("heading", { name: "Agregar Santa Rosa a tu inicio" }).waitFor();
  assert.equal(errors.length, 0, JSON.stringify(errors));
  console.log(
    "PASS: captura móvil, responsable real, validación persistida, sin desbordamiento, iconos y tutorial.",
  );
} finally {
  await browser.close();
}
