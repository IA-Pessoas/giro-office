import assert from "node:assert/strict";

import { chromium } from "@playwright/test";

// Roda contra um app já no ar (`next start`), como o smoke do modal de certificados (#1370).
const baseUrl = process.env.ROUTE_SMOKE_BASE_URL || "http://127.0.0.1:5177";

const smokeUser = {
  id: "user-route-smoke",
  name: "Route Smoke",
  login: "route.smoke@castelo.test",
  permission: 3,
  organization_id: "org-smoke",
  department_id: "department-smoke",
  status: "Ativo",
  version: 1,
  type: "owner",
  modules: { integracao: 3 },
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1440, height: 900 } });

try {
  await context.addCookies([
    { name: "cw.session", value: "opaque-test-session", url: baseUrl, httpOnly: true, sameSite: "Lax" },
  ]);
  const page = await context.newPage();
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: pathname.endsWith("/user/me") ? smokeUser : [] }),
    });
  });
  await page.route("**/socket.io/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/plain", body: "ok" });
  });

  for (const path of ["/rota-que-nao-existe", "/marketing"]) {
    const response = await page.goto(path, { waitUntil: "networkidle", timeout: 120_000 });
    assert.equal(response?.status(), 404, `${path}: status`);
    await page.getByRole("heading", { name: "Página não encontrada" }).waitFor();
    assert.equal(await page.title(), "Página não encontrada | Office", `${path}: título`);
    const back = page.getByRole("link", { name: "Ir para o dashboard" });
    assert.equal(await back.getAttribute("href"), "/dashboard");
    // Dentro do shell logado: a navegação lateral continua disponível.
    await page.locator("aside").getByRole("link", { name: "Clientes", exact: true }).waitFor();
    console.log(`PASS ${path}: 404 em português, dentro do shell, com link para o dashboard`);
  }

  for (const [from, to] of [
    ["/home", "/dashboard"],
    ["/users", "/administracao"],
    ["/me", "/configuracoes"],
    ["/clients/abc/commercial", "/clients/abc"],
  ]) {
    const response = await page.request.get(from, { maxRedirects: 0 });
    assert.equal(response.status(), 307, `${from}: status do redirect`);
    assert.equal(new URL(response.headers().location, baseUrl).pathname, to, `${from}: destino`);
    console.log(`PASS ${from} redireciona para ${to}`);
  }
} finally {
  await context.close();
  await browser.close();
}
