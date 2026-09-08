// Disposable localhost only. Use verify-office-ui.mjs to prepare fictional accounts first.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const auth = JSON.parse(readFileSync("/private/tmp/sr-office-test-auth.json", "utf8"));
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  for (const role of ["manager", "office", "field"]) {
    const c = await browser.newContext({
      storageState: auth[role],
      viewport: { width: 390, height: 844 },
      timezoneId: "Asia/Tokyo",
    });
    await c.route("**/*", (r) =>
      new URL(r.request().url()).hostname === "localhost" ? r.continue() : r.abort(),
    );
    const p = await c.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(
      "http://localhost:8081/junta?period=personalizado&from=2026-08-01&until=2026-08-31",
    );
    await p.getByLabel("Periodo", { exact: true }).waitFor();
    assert.equal(await p.getByLabel("Desde", { exact: true }).inputValue(), "2026-08-01");
    await p.getByLabel("Periodo", { exact: true }).selectOption("todo");
    await p.getByText("Todo el historial disponible del ciclo 26–27").waitFor();
    if (role !== "field")
      await p
        .getByLabel("Persona o cartera", { exact: true })
        .selectOption({ label: "Campo Ensayo" });
    await p.getByRole("region", { name: "Revisión individual" }).waitFor();
    await p
      .getByRole("link", { name: /Ver movimiento/ })
      .first()
      .click();
    await p.getByRole("heading", { name: "Movimiento que estás revisando", exact: true }).waitFor();
    await p.getByRole("button", { name: /Ver historia del expediente/ }).click();
    const history = p.locator("#bitacora");
    await history
      .getByLabel("Periodo de los movimientos", { exact: true })
      .selectOption("personalizado");
    await history.getByLabel("Desde", { exact: true }).fill("2026-08-01");
    await history.getByLabel("Hasta", { exact: true }).fill("2026-08-31");
    await history.getByRole("button", { name: "Aplicar fechas", exact: true }).click();
    await history.getByText("No hay movimientos con ese filtro.", { exact: true }).waitFor();
    await p.getByRole("link", { name: "← Volver al seguimiento", exact: true }).click();
    assert.equal(await p.getByLabel("Periodo", { exact: true }).inputValue(), "todo");
    await p.getByRole("button", { name: "Pendientes actuales", exact: true }).click();
    await p.getByText("Pendientes actuales · no dependen del periodo de actividad").waitFor();
    await p.getByRole("button", { name: "Actividad", exact: true }).click();
    await p.getByLabel("Periodo", { exact: true }).selectOption("hoy");
    await p
      .getByRole("link", { name: /Ver movimiento/ })
      .first()
      .click();
    await p.getByRole("heading", { name: "Movimiento que estás revisando", exact: true }).waitFor();
    await p.getByRole("link", { name: "← Volver al seguimiento", exact: true }).click();
    await p.evaluate(() => window.scrollTo(0, 0));
    assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await p.screenshot({ path: `/private/tmp/sr-period-${role}-mobile.png` });
    if (role === "manager") {
      await p.setViewportSize({ width: 1365, height: 950 });
      await p.screenshot({ path: "/private/tmp/sr-period-manager-desktop.png" });
      await p.goto("http://localhost:8081/junta?date=2026-08-03");
      await p.getByLabel("Periodo", { exact: true }).waitFor();
      assert.equal(await p.getByLabel("Periodo", { exact: true }).inputValue(), "personalizado");
      assert.equal(await p.getByLabel("Desde", { exact: true }).inputValue(), "2026-08-03");
    }
    await p.goto("http://localhost:8081/citas");
    await p
      .getByLabel("Fecha programada de las citas", { exact: true })
      .selectOption("personalizado");
    await p.getByLabel("Desde", { exact: true }).fill("2026-08-01");
    await p.getByLabel("Hasta", { exact: true }).fill("2026-08-31");
    await p.getByRole("button", { name: "Aplicar fechas", exact: true }).click();
    await p.getByRole("heading", { name: "Sin citas en este periodo", exact: true }).waitFor();
    await p.reload();
    assert.equal(await p.getByLabel("Desde", { exact: true }).inputValue(), "2026-08-01");
    await c.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: three roles, historical and same-day event links, retained filters, current pending, history dates, agenda range and reload, legacy URL, mobile and desktop. No external sends.",
  );
} finally {
  await browser.close();
}
