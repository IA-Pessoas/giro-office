import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const PORT = process.env.COMMERCIAL_SMOKE_PORT || "3127";
const baseUrl = (process.env.COMMERCIAL_SMOKE_BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const appRoot = fileURLToPath(new URL("../../..", import.meta.url));
const evidenceDir = process.env.COMMERCIAL_SMOKE_EVIDENCE_DIR || join(tmpdir(), "girooffice-commercial-959-evidence");
const smokeUser = {
  id: "user-commercial-smoke",
  name: "Comercial Smoke",
  login: "commercial.smoke",
  organization_id: "organization-commercial-smoke",
  permission: 2,
  type: "admin",
  modules: { comercial: 2 },
};
const client = {
  id: "b0000000-0000-4000-8000-000000000001",
  name: "Cliente Smoke",
  company_name: "Empresa Smoke",
  fantasy_name: "Smoke Ltda.",
};
const prospecting = {
  id: "d0000000-0000-4000-8000-000000000001",
  client_id: client.id,
  status: "Análise Financeira",
  status_date: "2026-09-10T00:00:00.000Z",
  description: "Retorno na próxima semana",
  client,
};
const taskBilling = {
  id: "e0000000-0000-4000-8000-000000000001",
  task_id: "f0000000-0000-4000-8000-000000000001",
  task_name: "Entrega Smoke",
  task_status: "A Realizar",
  billing: "Realizar",
  hiring_status: "A Realizar",
  payment: null,
  billing_description: null,
};

async function installMocks(page, context) {
  let prospectingList = [];
  let taskBillingList = [taskBilling];
  await context.addCookies([
    { name: "cw.session", value: "opaque-commercial-smoke", url: baseUrl, httpOnly: true },
    { name: "cw.csrf", value: "A".repeat(43), url: baseUrl, httpOnly: false },
  ]);
  await page.addInitScript(() => {
    if (!window.localStorage.getItem("workspace-theme")) window.localStorage.setItem("workspace-theme", "light");
    if (!window.localStorage.getItem("chakra-ui-color-mode")) window.localStorage.setItem("chakra-ui-color-mode", "light");
  });
  const json = (route, data, status = 200) => route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify({ success: true, data }),
  });
  await page.route("**/user/session/refresh", (route) => json(route, smokeUser));
  await page.route("**/user/me", (route) => json(route, smokeUser));
  await page.route("**/department/list*", (route) => json(route, []));
  await page.route("**/chat", (route) => json(route, []));
  await page.route("**/socket.io/**", (route) => route.abort());
  await page.route("**/commercial/proposal-configs", (route) => json(route, []));
  await page.route(/\/commercial\/task-billing(?:\/[^/]+)?$/, async (route) => {
    if (route.request().method() === "PUT") {
      taskBillingList = [{
        ...taskBilling,
        hiring_status: "Contratado",
        payment: "Pago",
        billing_description: "Cobrança confirmada",
      }];
      await json(route, taskBillingList[0]);
      return;
    }
    await json(route, taskBillingList);
  });
  await page.route(/\/commercial\/prospecting\/clients$/, (route) => json(route, [client]));
  await page.route(/\/commercial\/prospecting$/, async (route) => {
    if (route.request().method() === "POST") {
      prospectingList = [prospecting];
      await json(route, prospecting, 201);
      return;
    }
    await json(route, prospectingList);
  });
  await page.route(/\/commercial\/prospecting\/(?!clients$)[^/]+$/, async (route) => {
    if (route.request().method() === "PATCH") {
      await json(route, { ...prospecting, status: "Envio de Proposta" });
      return;
    }
    await json(route, prospecting);
  });
}

async function run() {
  await mkdir(evidenceDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const requests = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => { if (request.url().includes("commercial")) requests.push(`${request.method()} ${request.url()}`); });
  await installMocks(page, context);

  try {
    await page.goto("/comercial", { waitUntil: "networkidle" });
    try {
      await page.getByRole("heading", { name: "Prospecção" }).waitFor({ timeout: 10_000 });
    } catch (error) {
      throw new Error(`Comercial não renderizou: url=${page.url()} body=${(await page.locator("body").innerText()).slice(0, 1200)} requests=${requests.join(" | ")} console=${consoleErrors.join(" | ")} page=${pageErrors.join(" | ")}`, { cause: error });
    }
    await page.screenshot({ path: `${evidenceDir}/01-commercial-desktop-light.png`, fullPage: true });

    await page.getByRole("button", { name: "Nova prospecção" }).click();
    const clientSelect = page.locator('form[aria-label="Nova prospecção"] select').first();
    await clientSelect.focus();
    assert.equal(await page.evaluate(() => document.activeElement?.tagName), "SELECT");
    await page.screenshot({ path: `${evidenceDir}/02-commercial-form-focus.png`, fullPage: true });
    await clientSelect.selectOption(client.id);
    await page.getByLabel("Descrição").fill("Retorno na próxima semana");
    await page.getByRole("button", { name: "Salvar" }).click();
    await page.getByText("Análise Financeira").last().waitFor();
    await page.screenshot({ path: `${evidenceDir}/03-commercial-saved-light.png`, fullPage: true });
    await page.getByRole("button", { name: "Nova prospecção" }).click();
    await page.getByRole("form", { name: "Nova prospecção" }).waitFor();
    await page.getByRole("button", { name: "Cancelar" }).last().click();

    await page.getByRole("button", { name: "Editar cobrança" }).click();
    await page.getByLabel("Situação da contratação").selectOption("Contratado");
    await page.getByLabel("Pagamento").fill("Pago");
    await page.getByLabel("Descrição", { exact: true }).last().fill("Cobrança confirmada");
    await page.getByRole("button", { name: "Salvar cobrança" }).click();
    await page.getByText("Cobrança confirmada", { exact: true }).waitFor();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `${evidenceDir}/04-commercial-mobile-light.png`, fullPage: true });
    await page.evaluate(() => window.localStorage.setItem("workspace-theme", "dark"));
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Catálogo de propostas" }).waitFor();
    const darkTextEvidence = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas indisponível para validar contraste dark.");
      const read = (selector) => {
        const element = document.querySelector(selector);
        if (!element) throw new Error(`Elemento ausente: ${selector}`);
        const color = getComputedStyle(element).color;
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
        return { color, luminance: (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255 };
      };
      return {
        heading: read("h1"),
        intro: read("h1 + p"),
        taskBillingHeading: read("#commercial-task-billing-title"),
      };
    });
    for (const evidence of [darkTextEvidence.heading, darkTextEvidence.intro, darkTextEvidence.taskBillingHeading]) {
      assert.ok(evidence.luminance >= 0.65, `Texto dark com contraste baixo: ${JSON.stringify(evidence)}`);
    }
    await page.screenshot({ path: `${evidenceDir}/05-commercial-mobile-dark.png`, fullPage: true });
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
  } finally {
    await browser.close();
  }
}

async function withNextServer(test) {
  if (process.env.COMMERCIAL_SMOKE_BASE_URL) return test();
  const serverProcess = spawn("cmd", ["/c", "corepack", "pnpm", "exec", "next", "start", "--port", PORT], {
    cwd: appRoot,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Next start não iniciou a tempo.")), 30_000);
    const onData = (chunk) => {
      if (chunk.toString().includes("Ready in") || chunk.toString().includes("started server")) {
        clearTimeout(timeout);
        resolve();
      }
    };
    serverProcess.stdout.on("data", onData);
    serverProcess.stderr.on("data", onData);
    serverProcess.once("error", reject);
  });
  try { await test(); } finally { serverProcess.kill(); }
}

await withNextServer(run);
console.log(`commercial browser smoke passed; evidence=${evidenceDir}`);
