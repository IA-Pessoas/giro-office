import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";

const configuredBaseUrl = process.env.PLAYWRIGHT_BASE_URL?.replace(/\/$/, "");
const port = process.env.CONTABIL_BROWSER_SMOKE_PORT ?? "3125";
const baseUrl = configuredBaseUrl ?? `http://127.0.0.1:${port}`;
const appRoot = fileURLToPath(new URL("../../..", import.meta.url));
const screenshotPath =
  process.env.CONTABIL_BROWSER_SCREENSHOT_PATH ??
  "output/playwright/contabil-portfolio-dashboard.png";
const now = new Date();
const competence = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
const checklistFields = [
  "regenerate_accounting_entries",
  "check_summary_by_accumulator",
  "post_accounting_transaction",
  "import_bank_statements",
  "reconcile_bank_statements",
  "reconcile_vendors",
  "integrate_taxes",
  "settle_federal_taxes_via_ecac",
  "settle_state_taxes_via_sefaz_ba",
  "integrate_payroll",
  "suspense_accounts",
  "check_overdrawn_accounts",
  "general_account_reconciliation",
  "check_loan_and_interest_accounts",
  "monthly_closing",
  "reconcile_icms_pis_cofins",
  "depreciation",
];
const alphaId = "c1000000-0000-4000-8000-000000000001";
const betaId = "c1000000-0000-4000-8000-000000000002";

function createControl(clientId, id) {
  return {
    id,
    client_id: clientId,
    competence,
    ...Object.fromEntries(checklistFields.map((field) => [field, false])),
    notes: null,
  };
}

const portfolioItems = [
  { client_id: alphaId, legal_name: "Empresa Alfa", control: createControl(alphaId, "k1") },
  { client_id: betaId, legal_name: "Empresa Beta", control: null },
].map((item) => ({
  cpf_cnpj: "00000000000100",
  regime: "Simples Nacional",
  person_responsible_id: null,
  posted_by_id: null,
  closing: { status: "NOT_RECEIVED" },
  ...item,
}));
const user = {
  id: "c0000000-0000-4000-8000-000000000001",
  name: "Analista Contábil",
  login: "analista",
  permission: 2,
  organization_id: "a0000000-0000-4000-8000-000000000001",
  type: "admin",
  modules: { contabil: 2 },
};

function json(route, data, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(status >= 400 ? { error: "not found" } : { data }),
  });
}

async function runBrowserProof() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    baseURL: baseUrl,
    viewport: { width: 1440, height: 1200 },
  });
  await context.addCookies([
    { name: "cw.session", value: "fixture-session", url: baseUrl, httpOnly: true, sameSite: "Lax" },
    { name: "cw.csrf", value: "fixture-csrf", url: baseUrl, sameSite: "Lax" },
  ]);

  const page = await context.newPage();
  page.on("pageerror", (error) => console.error("pageerror:", error.message));
  page.on("console", (message) => message.type() === "error" && console.error("console:", message.text()));
  const requests = [];
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const apiPath = url.pathname.startsWith("/api/")
      ? url.pathname.slice("/api".length)
      : url.port === "3010"
        ? url.pathname
        : null;
    if (!apiPath) return route.continue();

    const method = request.method();
    requests.push({ method, path: apiPath, body: request.postDataJSON?.() });
    if (method === "GET" && apiPath === "/user/me") return json(route, user);
    if (method === "GET" && apiPath === "/contabil/controls/list") {
      return json(route, { competence, items: portfolioItems });
    }
    if (method === "PATCH" && apiPath.startsWith("/contabil/controls/")) {
      const controlId = apiPath.split("/").at(-1);
      const item = portfolioItems.find((entry) => entry.control?.id === controlId);
      const { field, value } = request.postDataJSON();
      item.control = { ...item.control, [field]: value };
      return json(route, item.control);
    }
    if (method === "POST" && apiPath === "/contabil/controls") {
      const { client_id: clientId } = request.postDataJSON();
      const item = portfolioItems.find((entry) => entry.client_id === clientId);
      item.control = createControl(clientId, "k2");
      return json(route, item.control);
    }
    if (method === "GET" && apiPath === "/triagem/editability") return json(route, { can_edit: true });
    if (method === "GET" && apiPath === "/triagem/monthly") {
      return json(route, {
        id: "m1",
        client_id: url.searchParams.get("client_id"),
        competence,
        type: "CONTABIL",
        billing_amount: null,
        checklist: {},
        item_notes: {},
        summary: {
          applicable: 0,
          completed: 0,
          attention: 0,
          pending: 0,
          notApplicable: 0,
          notPresent: 0,
          percentage: 0,
        },
      });
    }
    if (method === "GET" && apiPath.startsWith("/contabil/relationships/client/")) {
      return json(route, null, 404);
    }
    return json(route, []);
  });

  try {
    await page.goto("/contabil", { waitUntil: "domcontentloaded", timeout: 60000 });

    // Etapas 1 e 2: empresas e itens do checklist.
    await page.getByRole("button", { name: "Selecionar visíveis" }).click();
    await page.getByRole("button", { name: "Continuar para o checklist" }).click();
    await page.getByRole("button", { name: "Selecionar todos" }).click();
    await page.getByRole("button", { name: "Abrir dashboard" }).click();

    // Etapa 3: marcar item como feito direto na tabela.
    const alphaCell = page.getByRole("checkbox", {
      name: "Regerar lançamentos contábeis — Empresa Alfa",
    });
    await expect(alphaCell).toHaveAttribute("aria-checked", "false");
    await alphaCell.click();
    await expect(alphaCell).toHaveAttribute("aria-checked", "true");
    const patch = requests.find((request) => request.method === "PATCH");
    assert.deepEqual(patch.body, { field: "regenerate_accounting_entries", value: true });

    // Desmarcar volta para pendente.
    await alphaCell.click();
    await expect(alphaCell).toHaveAttribute("aria-checked", "false");

    // Empresa sem controle: "Iniciar" cria o controle e libera as células.
    await page.getByRole("button", { name: "Iniciar", exact: true }).click();
    const betaCell = page.getByRole("checkbox", { name: "Depreciação — Empresa Beta" });
    await expect(betaCell).toHaveAttribute("aria-checked", "false");
    assert.ok(requests.some((request) => request.method === "POST" && request.body?.client_id === betaId));
    await page.screenshot({ path: screenshotPath, fullPage: true });

    // Relacionamento e Documentos: escolher empresa pelo seletor da aba.
    await page.getByRole("tab", { name: "Relacionamento" }).click();
    await expect(page.getByText("Selecione uma empresa para começar")).toBeVisible();
    await page.getByLabel("Empresa").selectOption({ label: "Empresa Beta" });
    await expect(page.getByRole("heading", { name: "Relacionamento contábil" })).toBeVisible();
    assert.ok(requests.some((request) => request.path === `/contabil/relationships/client/${betaId}`));

    await page.getByRole("tab", { name: "Documentos" }).click();
    await expect(page.getByLabel("Empresa")).toHaveValue(betaId);
    await expect(page.getByRole("heading", { name: "Pendências documentais" })).toBeVisible();

    console.log(JSON.stringify({ url: page.url(), requestCount: requests.length, screenshotPath }));
  } finally {
    await browser.close();
  }
}

await withNextServer(runBrowserProof);

async function withNextServer(test) {
  if (configuredBaseUrl) {
    await test();
    return;
  }

  const serverProcess = spawn("corepack", ["pnpm", "exec", "next", "start", "--port", port], {
    cwd: appRoot,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  serverProcess.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  serverProcess.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  try {
    const startedAt = Date.now();
    while (true) {
      if (serverProcess.exitCode !== null) {
        throw new Error(`Next production server exited before smoke test.\n${output}`);
      }
      if (Date.now() - startedAt > 60_000) {
        throw new Error(`Timed out waiting for the production build at ${baseUrl}.\n${output}`);
      }
      try {
        const response = await fetch(`${baseUrl}/contabil`);
        if (response.status < 500) break;
      } catch {
        // Aguarda o Next abrir a porta.
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    await test();
  } finally {
    serverProcess.kill("SIGTERM");
  }
}
