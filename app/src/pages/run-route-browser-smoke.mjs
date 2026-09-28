import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  modules: { integracao: 3, marketing: 2 },
};
const dashboard = {
  requests: {
    active: { total: 0, rh: 0, ti: 0 },
    new: { total: 0, rh: 0, ti: 0 },
    urgent: { total: 0, rh: 0, ti: 0 },
  },
  birthdays: {
    clients: { total: 0, items: [] },
    employees: { total: 0, items: [] },
    companies: { total: 0, items: [] },
  },
  alerts: [],
};
const events = [
  {
    id: "72b62514-602b-4c63-b6af-5f75a18cebd2",
    name: "Evento de validação",
    logo: "",
    status: "Em andamento",
    priority: "Média",
    objective: "Fixture para validar o fluxo real do formulário.",
    audience: "Equipe interna",
  },
];
const outputDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../output/playwright",
);
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1440, height: 900 } });

try {
  await context.addCookies([
    { name: "cw.session", value: "opaque-test-session", url: baseUrl, httpOnly: true, sameSite: "Lax" },
  ]);
  const page = await context.newPage();
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    let data = [];
    if (pathname.endsWith("/user/me")) data = smokeUser;
    if (pathname.endsWith("/marketing/dashboard")) data = dashboard;
    if (pathname.endsWith("/marketing/events/list")) data = events;
    if (pathname.endsWith("/marketing/events") && route.request().method() === "POST") {
      const input = route.request().postDataJSON();
      const event = {
        id: "bbf842b7-0eb8-4b29-b33e-78d05a326173",
        ...input,
      };
      events.push(event);
      data = event;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data }),
    });
  });
  await page.route("**/socket.io/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/plain", body: "ok" });
  });

  for (const path of ["/rota-que-nao-existe"]) {
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

  const marketingResponse = await page.goto("/marketing", {
    waitUntil: "networkidle",
    timeout: 120_000,
  });
  assert.equal(marketingResponse?.status(), 200, "/marketing: status");
  await page.getByRole("heading", { name: "Marketing", exact: true }).waitFor();
  assert.equal(await page.title(), "Marketing", "/marketing: título");
  await page.getByRole("row", { name: /Evento de validação/ }).waitFor();
  await page.screenshot({ path: path.join(outputDirectory, "marketing-eventos.png"), fullPage: true });
  await page.getByRole("button", { name: "Ver evento Evento de validação" }).click();
  const detailsDialog = page.getByRole("dialog", { name: "Evento de validação" });
  await detailsDialog.getByText("Dados completos do evento").waitFor();
  await detailsDialog.getByText("Fixture para validar o fluxo real do formulário.").waitFor();
  await detailsDialog.getByText("Equipe interna").waitFor();
  await page.screenshot({ path: path.join(outputDirectory, "marketing-evento-detalhes.png"), fullPage: true });
  await detailsDialog.getByRole("button", { name: "Fechar" }).last().click();
  await page.getByRole("button", { name: "Novo evento" }).click();
  await page.getByRole("heading", { name: "Novo evento" }).waitFor();
  await page.screenshot({ path: path.join(outputDirectory, "marketing-evento-novo.png"), fullPage: true });
  await page.getByLabel("Nome *").fill("Evento criado pelo smoke");
  await page.getByLabel("Prioridade *").selectOption("Alta");
  await page.getByRole("button", { name: "Salvar evento" }).click();
  await page.getByRole("row", { name: /Evento criado pelo smoke/ }).waitFor();
  console.log("PASS /marketing: página autenticada e módulo ativo");
  console.log("PASS /marketing: lista, detalhes para leitura, criação e capturas em output/playwright");

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
