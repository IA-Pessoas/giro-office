import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";

const appRoot = fileURLToPath(new URL("../../..", import.meta.url));
const baseUrl = process.env.REPORTS_BROWSER_BASE_URL || "http://127.0.0.1:3115";
const evidenceDir = process.env.REPORTS_EVIDENCE_DIR;
const user = { id: "reports-fixture-user", login: "reports.fixture", name: "Pessoa de teste", type: "user", permission: 1,
  organization_id: "reports-fixture-org", department_id: "reports-fixture-department", modules: { integracao: 1, fiscal: 1 } };
const field = (key, label) => ({ key, label, value_type: "string", filter_operators: [], aggregations: [] });
const items = [
  { key: "integracao.projects", label: "Projetos", module: "integracao", department_label: "Integração",
    description: "Acompanhe projetos, prazos e responsáveis.", fields: [field("name", "Nome"), field("status", "Situação")] },
  { key: "integracao.clients", label: "Clientes", module: "integracao", department_label: "Integração",
    description: "Consulte informações dos clientes.", fields: [field("name", "Nome"), field("email", "E-mail")] },
  { key: "fiscal.tax", label: "Tributos", module: "fiscal", department_label: "Fiscal",
    description: "Consulte tributos e suas competências.", fields: [field("period", "Competência")] },
];

async function run() {
  const browser = await chromium.launch({ headless: true, ...(process.env.REPORTS_BROWSER_CHANNEL ? { channel: process.env.REPORTS_BROWSER_CHANNEL } : {}) });
  const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1440, height: 1000 } });
  await context.addCookies([
    { name: "cw.session", value: "opaque-report-fixture", url: baseUrl, httpOnly: true, sameSite: "Lax" },
    { name: "cw.csrf", value: "A".repeat(43), url: baseUrl, sameSite: "Lax" },
  ]);
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const definitions = [];
  let reviewFailure = false;
  let catalogRequests = 0;
  let catalogMode = "ready";
  let reviewGate;
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await page.route("**/socket.io/**", (route) => route.fulfill({ status: 200, contentType: "text/plain", body: route.request().method() === "POST" ? "ok" : '0{"sid":"reports-fixture","upgrades":[],"pingInterval":25000,"pingTimeout":20000}' }));
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, "");
    if (path === "/reports/definitions/validate") {
      const payload = route.request().postDataJSON();
      assert.equal(route.request().headers()["x-csrf-token"], "A".repeat(43));
      definitions.push(payload.definition);
      if (reviewGate) await reviewGate;
      return route.fulfill({ status: reviewFailure ? 403 : 200, json: reviewFailure
        ? { success: false, error: "internal.secret_identifier", code: "FORBIDDEN" }
        : { success: true, data: payload } });
    }
    if (path === "/reports/catalog") catalogRequests++;
    const data = path === "/user/me" ? user : path === "/reports/catalog" ? { items: catalogMode === "empty" ? [] : catalogMode === "invalid" ? null : items } : [];
    await route.fulfill({ status: 200, json: { success: true, data } });
  });
  async function screenshot(name) {
    if (!evidenceDir) return;
    await mkdir(evidenceDir, { recursive: true });
    await page.screenshot({ path: `${evidenceDir}/${name}.png`, fullPage: true, animations: "disabled" });
  }
  async function checkLanguage() {
    assert.doesNotMatch(await page.getByRole("tabpanel").innerText(), /integracao\.|fiscal\.|\b(?:source|snapshot|job|inner|left|join|alias|predicado|descritor)\b|internal.secret_identifier/i);
  }
  try {
    await page.goto("/relatorios", { waitUntil: "domcontentloaded" });
    const panel = page.getByRole("tabpanel");
    await expect(panel.getByRole("checkbox", { name: "Projetos", exact: true })).toBeVisible();
    await panel.getByRole("checkbox", { name: "Projetos", exact: true }).check();
    await panel.getByRole("checkbox", { name: "Clientes", exact: true }).check();
    await expect(panel.getByText("2 áreas selecionadas", { exact: true })).toBeVisible();
    await expect(panel.getByRole("group", { name: "Integração", exact: true }).getByRole("checkbox")).toHaveCount(2);
    await expect(panel.getByRole("group", { name: "Fiscal", exact: true }).getByRole("checkbox")).toHaveCount(1);
    await checkLanguage();
    await screenshot("01-areas-desktop");
    await panel.getByRole("button", { name: "Escolher campos", exact: true }).click();
    const projects = panel.getByRole("group", { name: "Campos de Projetos", exact: true });
    const clients = panel.getByRole("group", { name: "Campos de Clientes", exact: true });
    await expect(projects.getByRole("checkbox", { checked: true })).toHaveCount(0);
    await expect(clients.getByRole("checkbox", { checked: true })).toHaveCount(0);
    await panel.getByRole("button", { name: "Revisar relatório", exact: true }).click();
    await expect(panel.getByRole("alert")).toContainText("Escolha ao menos um campo");
    await expect(panel.getByRole("alert")).toBeFocused();
    await screenshot("02-campos-vazios");
    await projects.getByRole("checkbox", { name: "Nome", exact: true }).check();
    await clients.getByRole("button", { name: "Selecionar todos", exact: true }).click();
    await expect(clients.getByRole("checkbox", { checked: true })).toHaveCount(2);
    await screenshot("03-campos-selecionados");
    await clients.getByRole("button", { name: "Limpar todos", exact: true }).click();
    await expect(clients.getByRole("checkbox", { checked: true })).toHaveCount(0);
    await panel.getByRole("button", { name: "Remover Clientes", exact: true }).click();
    await expect(projects.getByRole("checkbox", { name: "Nome", exact: true })).toBeChecked();
    await panel.getByRole("button", { name: "Revisar relatório", exact: true }).click();
    await expect(panel.getByRole("heading", { name: "Revisar relatório", exact: true })).toBeVisible();
    assert.deepEqual(definitions[0], { version: 2, areas: [{ source: "integracao.projects", fields: ["name"] }] });
    await checkLanguage();
    await page.evaluate(() => {
      document.documentElement.classList.replace("light", "dark");
      document.documentElement.setAttribute("data-theme", "dark");
    });
    await screenshot("04-revisao-dark");
    await page.evaluate(() => {
      document.documentElement.classList.replace("dark", "light");
      document.documentElement.setAttribute("data-theme", "light");
    });
    await panel.getByRole("button", { name: "Ajustar áreas", exact: true }).click();
    await panel.getByRole("checkbox", { name: "Clientes", exact: true }).focus();
    await page.keyboard.press("Space");
    await expect(panel.getByRole("checkbox", { name: "Clientes", exact: true })).toBeChecked();
    await panel.getByRole("button", { name: "Escolher campos", exact: true }).click();
    await expect(clients.getByRole("checkbox", { checked: true })).toHaveCount(0);
    await clients.getByRole("checkbox", { name: "E-mail", exact: true }).check();
    reviewFailure = true;
    const previousCatalogRequests = catalogRequests;
    await panel.getByRole("button", { name: "Revisar relatório", exact: true }).click();
    await expect(panel.getByRole("alert")).toContainText("Seu acesso mudou");
    await expect.poll(() => catalogRequests).toBeGreaterThan(previousCatalogRequests);
    await expect(projects.getByRole("checkbox", { name: "Nome", exact: true })).toBeChecked();
    await checkLanguage();
    reviewFailure = false;
    await panel.getByRole("button", { name: "1. Escolher áreas", exact: true }).click();
    let finishReview;
    reviewGate = new Promise((resolve) => { finishReview = resolve; });
    await panel.getByRole("button", { name: "3. Revisar relatório", exact: true }).click();
    await expect(panel.getByRole("checkbox", { name: "Projetos", exact: true })).toBeDisabled();
    await expect(panel.getByRole("button", { name: "Remover Clientes", exact: true })).toBeDisabled();
    finishReview();
    reviewGate = undefined;
    await expect(panel.getByRole("heading", { name: "Revisar relatório", exact: true })).toBeVisible();
    assert.deepEqual(definitions.at(-1).areas, [{ source: "integracao.projects", fields: ["name"] }, { source: "integracao.clients", fields: ["email"] }]);
    await page.setViewportSize({ width: 390, height: 844 });
    await checkLanguage();
    await screenshot("05-revisao-mobile");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "Layout não deve transbordar no mobile");
    await panel.getByRole("button", { name: "Remover Projetos", exact: true }).click();
    await expect(clients.getByRole("checkbox", { name: "E-mail", exact: true })).toBeChecked();
    await panel.getByRole("button", { name: "Remover Clientes", exact: true }).click();
    await panel.getByRole("button", { name: "Revisar relatório", exact: true }).click();
    await expect(panel.getByRole("alert")).toContainText("Escolha ao menos uma área");
    catalogMode = "empty";
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(panel.getByRole("status")).toContainText("Nenhuma área está disponível");
    catalogMode = "invalid";
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(panel.getByRole("alert")).toContainText("Não foi possível carregar as áreas", { timeout: 15000 });
    await checkLanguage();
    catalogMode = "ready";
    await panel.getByRole("button", { name: "Tentar novamente", exact: true }).click();
    await expect(panel.getByRole("checkbox", { name: "Projetos", exact: true })).toBeVisible();
    assert.deepEqual(pageErrors, []);
    const unexpectedConsoleErrors = consoleErrors.filter((message) => !message.includes("403 (Forbidden)"));
    assert.deepEqual(unexpectedConsoleErrors, []);
    console.log("PASS áreas/campos/revisão: agrupamento, múltiplas escolhas, vazios, remoção, preservação, teclado/foco, linguagem, CSRF, atualização do catálogo, desktop/mobile/dark e console");
  } finally {
    await browser.close();
  }
}

await readFile(`${appRoot}/.next/BUILD_ID`, "utf8");
if (process.env.REPORTS_BROWSER_BASE_URL) {
  await run();
} else {
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--port", "3115", "--hostname", "127.0.0.1"], {
    cwd: appRoot, env: process.env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  console.log(`Next compilado PID=${server.pid} porta=3115 worktree=${appRoot}`);
  let output = "";
  server.stdout.on("data", (chunk) => { output += chunk; });
  server.stderr.on("data", (chunk) => { output += chunk; });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (server.exitCode !== null) throw new Error(output);
      try { if ((await fetch(`${baseUrl}/login`)).status < 500) { ready = true; break; } } catch {}
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    assert.ok(ready, "Next compilado não iniciou");
    await run();
  } finally {
    server.kill();
  }
}
