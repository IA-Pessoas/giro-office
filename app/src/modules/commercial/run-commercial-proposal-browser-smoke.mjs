import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const baseUrl = (process.env.COMMERCIAL_SMOKE_BASE_URL || "http://localhost:3174").replace(/\/$/u, "");
const evidenceDir = process.env.COMMERCIAL_SMOKE_EVIDENCE_DIR || "output/playwright/issue-1889";
const csrf = "A".repeat(43);
const jwtSecret = "commercial-smoke-jwt-secret";
const user = {
  id: "user-commercial-proposal-smoke",
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
  cpf_cnpj: "12.345.678/0001-90",
  number: "(11) 3333-4444",
  email: "contato@smoke.test",
  indication: "Indicação de teste",
  regime: "Simples Nacional",
  partners: [{ clientPF: { name: "Sócio Smoke" } }],
};
const task = {
  id: "f0000000-0000-4000-8000-000000000001",
  name: "Serviço único Smoke",
  status: "A Realizar",
  billing: "Realizar",
  charge_comercial: true,
  hiring_status: null,
  payment: null,
  billing_description: null,
  charge_financeiro: false,
  client_name: client.company_name,
  project_name: "Projeto Smoke",
  responsible_name: null,
  isOwn: false,
  isUnassigned: false,
};
const config = { id: "c0000000-0000-4000-8000-000000000001", name: "Salário mínimo", contract_value: 1800.125 };
const prospecting = {
  id: "d0000000-0000-4000-8000-000000000001",
  client_id: client.id,
  status: "Análise Financeira",
  status_date: "2026-09-10T00:00:00.000Z",
  solution: "CASTELO",
  reference_month: "2026-09",
  service: "Contabilidade",
  description: "Retorno na próxima semana",
  participants: "Ana e Bruno",
  meeting_mode: "Remota",
  branch: "Matriz",
  pause_reason: null,
  reset_date: null,
  attachment_name: null,
  attachment_mime_type: null,
  attachment_size_bytes: null,
  client: {
    ...client,
    partners: [{ clientPF: { name: "Sócio Smoke" } }],
  },
};

function base64url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function sessionToken() {
  const header = base64url({ alg: "HS256", typ: "JWT" });
  const payload = base64url({
    user_id: user.id,
    organization_id: user.organization_id,
    permission: user.permission,
    type: user.type,
    modules: user.modules,
    session_id: "commercial-proposal-smoke",
    session_version: 1,
    csrf_hash: createHash("sha256").update(csrf).digest("hex"),
  });
  const signature = createHmac("sha256", jwtSecret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

async function run() {
  await mkdir(evidenceDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const proposalWrites = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("request", (request) => {
    if (request.method() !== "GET" && /\/commercial\/proposals?(\/|$)/u.test(new URL(request.url()).pathname)) {
      proposalWrites.push(`${request.method()} ${request.url()}`);
    }
  });

  try {
    await context.addCookies([
      { name: "cw.session", value: sessionToken(), url: baseUrl, httpOnly: true },
      { name: "cw.csrf", value: csrf, url: baseUrl, httpOnly: false },
    ]);
    const json = async (route, data, status = 200) => route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data }),
    });
    await page.route("**/api/user/me", (route) => json(route, user));
    await page.route("**/api/task/notifications", (route) => json(route, []));
    await page.route("**/api/client/list**", (route) => json(route, { items: [client], total: 1, page: 1, pageSize: 20, hasMore: false }));
    await page.route(`**/api/client/${client.id}`, (route) => json(route, client));
    await page.route("**/api/commercial/proposal-configs", (route) => json(route, [config]));
    await page.route("**/api/commercial/task-billing", (route) => json(route, []));
    await page.route("**/api/task/list**", (route) => json(route, { data: [task], total: 1, hasMore: false, summary: { inProgress: 0, billable: 1 } }));
    await page.route("**/api/commercial/prospecting**", (route) => {
      const path = new URL(route.request().url()).pathname.replace(/^\/api/u, "");
      if (path.endsWith("/clients")) return json(route, []);
      return json(route, { items: [prospecting], page: 1, page_size: 20, total: 1, total_pages: 1 });
    });

    await page.goto("/comercial", { waitUntil: "networkidle" });
    const prepareLink = page.getByRole("link", { name: "Preparar proposta", exact: true });
    await prepareLink.waitFor({ state: "visible" });
    await prepareLink.click();
    await page.getByRole("heading", { name: "Preparar proposta", exact: true }).waitFor();
    await page.waitForTimeout(500);
    assert.ok(
      (await page.locator("body").innerText()).includes(client.company_name),
      `cliente não carregou; url=${page.url()} body=${(await page.locator("body").innerText()).slice(0, 1800)}`,
    );
    await page.getByLabel("Descrição do serviço único 1").waitFor();
    await page.screenshot({ path: `${evidenceDir}/proposal-edit.png`, fullPage: true });

    await page.getByLabel("Percentual do serviço recorrente 1").fill("2");
    assert.equal(await page.getByLabel("Valor mensal do serviço recorrente 1").inputValue(), "36.00");
    await page.getByLabel("Quantidade do serviço único 1").fill("2");
    await page.getByLabel("Valor unitário do serviço único 1").fill("75");
    assert.equal(await page.getByLabel("Valor total do serviço único 1").inputValue(), "150.00");
    await page.getByLabel("Desconto", { exact: true }).fill("10");
    await page.getByText("Total com desconto: Informe a unidade do desconto para calcular", { exact: true }).waitFor();
    await page.getByLabel("Forma de pagamento").selectOption({ label: "PIX" });
    assert.equal(await page.getByLabel("Desconto", { exact: true }).inputValue(), "10");
    await page.getByLabel("Unidade do desconto").selectOption("PERCENT");
    await page.getByLabel("Primeiro vencimento").fill("2026-11-15");
    assert.equal(await page.getByLabel("Modelo").inputValue(), "padrao");
    await page.getByRole("button", { name: "Prévia", exact: true }).click();
    await page.getByText("ORÇAMENTO — PRESTAÇÃO DE SERVIÇOS CONTÁBEIS", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Editar valores", exact: true }).click();
    await page.getByLabel("Modelo").selectOption("detalhada");
    await page.getByRole("button", { name: "Prévia", exact: true }).click();
    await page.getByText("ORÇAMENTO DETALHADO — SERVIÇOS CONTÁBEIS", { exact: true }).waitFor();
    await page.getByText("Total com desconto: R$ 135,00", { exact: true }).waitFor();
    await page.getByText("Desconto: 10 %", { exact: true }).waitFor();
    await page.getByText("Validade: 10 dias a partir da emissão.", { exact: true }).waitFor();
    await page.getByText("Primeiro vencimento: 15/11/2026", { exact: true }).waitFor();
    assert.equal(await page.getByLabel("Desconto", { exact: true }).count(), 0);
    await page.screenshot({ path: `${evidenceDir}/proposal-preview.png`, fullPage: true });

    await page.emulateMedia({ media: "print" });
    const printState = await page.evaluate(() => ({
      documentVisibility: getComputedStyle(document.querySelector(".commercial-proposal-print")).visibility,
      printControls: document.querySelectorAll(".commercial-proposal-print .hide-on-print").length,
    }));
    assert.deepEqual(printState, { documentVisibility: "visible", printControls: 0 });
    await page.screenshot({ path: `${evidenceDir}/proposal-print.png`, fullPage: true });
    await page.pdf({ path: `${evidenceDir}/proposal.pdf`, format: "A4", printBackground: true });
    await page.evaluate(() => { window.__printCalls = 0; window.print = () => { window.__printCalls += 1; }; });
    await page.emulateMedia({ media: "screen" });
    await page.getByRole("button", { name: "Imprimir / Salvar em PDF", exact: true }).click();
    await page.waitForFunction(() => window.__printCalls === 1);
    await page.getByRole("button", { name: "Editar valores", exact: true }).click();
    await page.getByLabel("Modelo").selectOption("informativa");
    await page.getByRole("button", { name: "Prévia", exact: true }).click();
    await page.getByText("PROPOSTA DE SERVIÇOS CONTÁBEIS", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Voltar ao Comercial" }).click();
    await page.getByRole("button", { name: "Kanban", exact: true }).click();
    await page.getByRole("link", { name: "Preparar proposta", exact: true }).waitFor();
    assert.deepEqual(proposalWrites, [], "documento não pode ser persistido automaticamente");
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
  } finally {
    await context.close();
    await browser.close();
  }
}

await run();
console.log(`commercial proposal browser smoke passed; evidence=${evidenceDir}`);
