import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";

import { EMPTY_SOLICITATION_INDICATORS } from "../triagem/triagemSmokeFixtures.mjs";

const configuredBaseUrl = process.env.PLAYWRIGHT_BASE_URL?.replace(/\/$/, "");
const port = process.env.TRIAGE_BROWSER_SMOKE_PORT ?? "3126";
const baseUrl = configuredBaseUrl ?? `http://127.0.0.1:${port}`;
const appRoot = fileURLToPath(new URL("../../..", import.meta.url));
const screenshotPath =
  process.env.TRIAGE_BROWSER_SCREENSHOT_PATH ??
  "output/playwright/issue-1150-triagem-bank-statements.png";
const clientId = "c1000000-0000-4000-8000-000000000001";
const monthlyId = "m1000000-0000-4000-8000-000000000001";
const competence = "2026-09";
const accountingFields = [
  "financial_transactions",
  "triaged_transactions",
  "inventory_control",
  "accounts_payable_report",
  "accounts_receivable_report",
  "card_statements",
  "loan_agreements",
  "bank_reconciliation",
  "bank_investments",
  "card_sales_report",
];
const monthlyFixture = {
  id: monthlyId,
  client_id: clientId,
  competence,
  type: "CONTABIL",
  billing_amount: null,
  checklist: Object.fromEntries(accountingFields.map((field) => [field, "PENDING"])),
  item_notes: Object.fromEntries(
    accountingFields.map((field) => [field, { note: null, justification: null }]),
  ),
  summary: {
    applicable: accountingFields.length,
    completed: 0,
    attention: 0,
    pending: accountingFields.length,
    notApplicable: 0,
    notPresent: 0,
    percentage: 0,
  },
};
const statements = [
  {
    id: "s1000000-0000-4000-8000-000000000001",
    client_id: clientId,
    competence,
    bank_id: "001",
    status: "COMPLETED",
    archived_at: null,
  },
  {
    id: "s1000000-0000-4000-8000-000000000002",
    client_id: clientId,
    competence: "2026-06",
    bank_id: "237",
    status: "PENDING",
    archived_at: null,
  },
];
const PENDING_STATUSES = new Set(["PENDING", "ATTENTION", "UNDER_REVIEW"]);
const user = {
  id: "c0000000-0000-4000-8000-000000000001",
  name: "Analista Contábil",
  login: "analista",
  permission: 2,
  organization_id: "a0000000-0000-4000-8000-000000000001",
  type: "admin",
  modules: { triagem: 2, contabil: 2 },
};
const triageOverviewFixture = {
  items: [],
  total: 0,
  page: 1,
  page_size: 20,
  indicators: { urgent_open: 0, routine_pending: 0, bank_pending: 0, complete: 0 },
};

function json(route, data, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify({ data }),
  });
}

async function runBrowserProof() {
  const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  baseURL: baseUrl,
  viewport: { width: 1440, height: 1200 },
});
await context.addCookies([
  {
    name: "cw.session",
    value: "fixture-session",
    url: baseUrl,
    httpOnly: true,
    sameSite: "Lax",
  },
  {
    name: "cw.csrf",
    value: "fixture-csrf",
    url: baseUrl,
    sameSite: "Lax",
  },
]);

const page = await context.newPage();
// A competência inicial é a do relógio; fixar o mês mantém o smoke estável fora de 2026-09.
await page.clock.setFixedTime(new Date("2026-09-15T12:00:00-03:00"));
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

  requests.push({ method: request.method(), path: apiPath, body: request.postDataJSON?.() });
  if (request.method() === "GET" && apiPath === "/user/me") return json(route, user);
  if (request.method() === "GET" && apiPath === "/triagem/overview") {
    return json(route, triageOverviewFixture);
  }
  if (request.method() === "GET" && apiPath === "/client/list") {
    return json(route, {
      items: [
        {
          id: clientId,
          name: "Cliente Demonstração",
          company_name: "Cliente Demonstração",
          cpf_cnpj: "00.000.000/0001-00",
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
      totalPages: 1,
    });
  }
  if (request.method() === "GET" && apiPath === "/triagem/competencies") {
    return json(route, [
      {
        id: "t1000000-0000-4000-8000-000000000001",
        client_id: clientId,
        competence,
        configuration_snapshot: {},
        responsible_snapshot: {},
        archived_at: null,
        created_at: "2026-09-01T00:00:00.000Z",
        updated_at: "2026-09-01T00:00:00.000Z",
      },
    ]);
  }
  if (request.method() === "GET" && apiPath === "/triagem/editability") {
    return json(route, { can_edit: true });
  }
  if (request.method() === "GET" && apiPath === "/triagem/monthly") {
    return json(route, monthlyFixture);
  }
  if (request.method() === "GET" && apiPath === "/triagem/statements/history") {
    const pendingOnly = new URL(request.url()).searchParams.get("pending") === "true";
    const rows = statements
      .filter((item) => item.archived_at === null && (!pendingOnly || PENDING_STATUSES.has(item.status)))
      .sort((a, b) => b.competence.localeCompare(a.competence) || a.bank_id.localeCompare(b.bank_id));
    const competences = [...new Set(rows.map((item) => item.competence))].map((key) => {
      const group = rows.filter((item) => item.competence === key);
      return {
        competence: key,
        pending: group.filter((item) => PENDING_STATUSES.has(item.status)).length,
        statements: group.map(({ bank_id, status }) => ({ bank_id, status })),
      };
    });
    return json(route, { client_id: clientId, truncated: false, competences });
  }
  if (request.method() === "GET" && apiPath === "/triagem/statements") {
    const selected = new URL(request.url()).searchParams.get("competence");
    return json(
      route,
      statements.filter((statement) => statement.archived_at === null && statement.competence === selected),
    );
  }
  if (request.method() === "GET" && apiPath === "/triagem/closing") {
    return json(route, {
      id: "cl1000000-0000-4000-8000-000000000001",
      client_id: clientId,
      competence,
      status: "RECEIVED",
      archived_at: null,
    });
  }
  if (request.method() === "PUT" && apiPath === "/triagem/statements") {
    const body = request.postDataJSON();
    const existing = statements.find((statement) => statement.bank_id === body.bank_id);
    if (existing) {
      existing.status = body.status;
      existing.archived_at = null;
    } else {
      statements.push({
        id: "s1000000-0000-4000-8000-000000000002",
        client_id: body.client_id,
        competence: body.competence,
        bank_id: body.bank_id,
        status: body.status,
        archived_at: null,
      });
    }
    return json(route, statements.at(-1));
  }
  if (request.method() === "DELETE" && apiPath === "/triagem/statements") {
    const body = request.postDataJSON();
    const statement = statements.find((item) => item.bank_id === body.bank_id);
    if (!statement || statement.archived_at !== null) return json(route, { error: "not found" }, 404);
    statement.archived_at = "2026-09-17T10:00:00.000Z";
    return json(route, statement);
  }
  if (request.method() === "GET" && apiPath === "/triagem/solicitations/indicators") {
    return json(route, EMPTY_SOLICITATION_INDICATORS);
  }
  return json(route, []);
});

try {
  await page.goto("/triagem", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("button", { name: "Selecionar cliente" }).click();
  await page.getByRole("option", { name: /Cliente Demonstração/ }).click();

  await expect(page.getByRole("heading", { name: "Pendências documentais" })).toBeVisible();
  const bankStatus = page.getByLabel("Status do banco 001");
  await expect(bankStatus).toHaveValue("COMPLETED");
  const history = page.locator('section[aria-labelledby="triage-statement-history-title"]');
  await expect(history.getByText("Competência 2026-06 · 1 pendente(s)")).toBeVisible();
  await expect(history.getByText("Competência 2026-09")).toHaveCount(0);

  await bankStatus.selectOption("UNDER_REVIEW");
  await expect.poll(() =>
    requests.filter(
      (request) => request.method === "PUT" && request.path === "/triagem/statements",
    ).length,
  ).toBe(1);
  assert.equal(requests.find((request) => request.method === "PUT").body.status, "UNDER_REVIEW");
  // A mudança no banco aparece no histórico sem recarregar a página.
  await expect(history.getByText("Competência 2026-09 · 1 pendente(s)")).toBeVisible();

  await page.getByRole("button", { name: "Arquivar marcador do banco 001" }).click();
  await page
    .getByRole("dialog", { name: "Arquivar marcador do banco" })
    .getByRole("button", { name: "Arquivar", exact: true })
    .click();
  await expect(page.getByText("Nenhum marcador registrado.")).toBeVisible();
  assert.ok(
    requests.some(
      (request) => request.method === "DELETE" && request.path === "/triagem/statements",
    ),
  );

  await page.getByLabel("Identificador do banco").fill("001");
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  await expect(page.getByLabel("Status do banco 001")).toHaveValue("PENDING");
  const reopenRequest = requests.find(
    (request) => request.method === "PUT" && request.path === "/triagem/statements" && request.body.status === "PENDING",
  );
  assert.ok(reopenRequest);

  await history.getByRole("button", { name: "Abrir competência 2026-06" }).click();
  await expect(page.getByLabel("Status do banco 237")).toHaveValue("PENDING");

  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(
    JSON.stringify({
      url: page.url(),
      bankStatus: await page.getByLabel("Status do banco 237").inputValue(),
      requestCount: requests.length,
      screenshotPath,
    }),
  );
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

  const command = process.platform === "win32" ? "cmd" : "corepack";
  const args =
    process.platform === "win32"
      ? ["/c", "corepack", "pnpm", "exec", "next", "start", "--port", port]
      : ["pnpm", "exec", "next", "start", "--port", port];
  const serverProcess = spawn(command, args, {
    cwd: appRoot,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let output = "";
  serverProcess.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  serverProcess.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  try {
    await waitForServer(serverProcess, () => output);
    await test();
  } finally {
    stopServer(serverProcess);
  }
}

async function waitForServer(serverProcess, getOutput) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 60_000) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`Next production server exited before smoke test.\n${getOutput()}`);
    }

    try {
      const response = await fetch(`${baseUrl}/triagem`);
      if (response.ok || response.status < 500) return;
    } catch {
      // Retry until Next binds the port.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for the production build at ${baseUrl}.\n${getOutput()}`);
}

function stopServer(serverProcess) {
  if (!serverProcess.pid || serverProcess.exitCode !== null) return;
  if (process.platform === "win32") {
    execFileSync("taskkill", ["/pid", String(serverProcess.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }
  serverProcess.kill("SIGTERM");
}
