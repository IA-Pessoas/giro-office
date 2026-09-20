import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { chromium, expect } from "@playwright/test";

import { browserSmokeEnv } from "../../shared/testing/browserSmokeEnv.mjs";

const configuredBaseUrl = process.env.PLAYWRIGHT_BASE_URL?.replace(/\/$/, "");
const port = process.env.TRIAGE_URGENT_REQUESTS_SMOKE_PORT ?? "3128";
const baseUrl = configuredBaseUrl ?? `http://127.0.0.1:${port}`;
const appRoot = fileURLToPath(new URL("../../..", import.meta.url));
const smokeEnv = browserSmokeEnv();
const screenshotPath =
  process.env.TRIAGE_URGENT_REQUESTS_SCREENSHOT_PATH ??
  "output/playwright/issue-1151-triagem-urgent-requests.png";
const clientId = "c1000000-0000-4000-8000-000000000001";
const requestId = "d1000000-0000-4000-8000-000000000001";
const competence = "2026-09";
const requests = [];
const user = {
  id: "c0000000-0000-4000-8000-000000000001",
  name: "Analista de Triagem",
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
    { name: "cw.session", value: "fixture-session", url: baseUrl, httpOnly: true, sameSite: "Lax" },
    { name: "cw.csrf", value: "fixture-csrf", url: baseUrl, sameSite: "Lax" },
  ]);

  const page = await context.newPage();
  const requestLog = [];
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const apiPath = url.pathname.startsWith("/api/")
      ? url.pathname.slice("/api".length)
      : url.port === "3010"
        ? url.pathname
        : null;
    if (!apiPath) return route.continue();

    const body = request.postDataJSON?.();
    requestLog.push({ method: request.method(), path: apiPath, body });
    if (request.method() === "GET" && apiPath === "/user/me") return json(route, user);
    if (request.method() === "GET" && apiPath === "/triagem/overview") {
      return json(route, triageOverviewFixture);
    }
    if (request.method() === "GET" && apiPath === "/client/list") {
      return json(route, {
        items: [{ id: clientId, name: "Cliente Demonstração", company_name: "Cliente Demonstração" }],
        total: 1,
        page: 1,
        pageSize: 50,
        totalPages: 1,
      });
    }
    if (request.method() === "GET" && apiPath === "/rh/operational-users") {
      return json(route, [{ id: user.id, name: user.name, status: "Ativo", department: "Triagem" }]);
    }
    if (request.method() === "GET" && apiPath === "/triagem/competencies") {
      return json(route, [{
        id: "t1000000-0000-4000-8000-000000000001",
        client_id: clientId,
        competence,
        configuration_snapshot: {},
        responsible_snapshot: {},
        archived_at: null,
        created_at: "2026-09-01T00:00:00.000Z",
        updated_at: "2026-09-01T00:00:00.000Z",
      }]);
    }
    if (request.method() === "GET" && apiPath === "/triagem/external-links") return json(route, []);
    if (request.method() === "GET" && apiPath === "/triagem/urgent-requests") return json(route, requests);
    if (request.method() === "POST" && apiPath === "/triagem/urgent-requests") {
      const created = {
        id: requestId,
        client_id: clientId,
        competence,
        requester_id: user.id,
        responsible_id: body.responsible_id,
        urgency_code: body.urgency_code,
        description: body.description,
        status: "OPEN",
        resolution_note: null,
        resolved_at: null,
        created_at: "2026-09-18T00:00:00.000Z",
        updated_at: "2026-09-18T00:00:00.000Z",
        requester: { id: user.id, name: user.name, full_name: null },
        responsible: { id: user.id, name: user.name, full_name: null },
      };
      requests.push(created);
      return json(route, created, 201);
    }
    if (request.method() === "PATCH" && apiPath.endsWith("/close")) {
      Object.assign(requests[0], {
        status: "CLOSED",
        resolution_note: body.resolution_note,
        resolved_at: "2026-09-18T01:00:00.000Z",
      });
      return json(route, requests[0]);
    }
    if (request.method() === "PATCH" && apiPath.endsWith("/reopen")) {
      Object.assign(requests[0], { status: "OPEN", resolution_note: null, resolved_at: null });
      return json(route, requests[0]);
    }
    if (request.method() === "GET" && apiPath === "/triagem/editability") return json(route, { can_edit: true });
    if (request.method() === "GET" && apiPath === "/triagem/monthly") return json(route, null);
    if (request.method() === "GET" && apiPath === "/triagem/statements") return json(route, []);
    if (request.method() === "GET" && apiPath === "/triagem/closing") return json(route, null);
    return json(route, []);
  });

  try {
    await page.goto("/triagem", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.getByRole("button", { name: "Selecionar cliente" }).click();
    await page.getByRole("option", { name: /Cliente Demonstração/ }).click();
    await expect(page.getByRole("heading", { name: "Solicitações urgentes" })).toBeVisible();

    await page.getByLabel("Código de urgência").selectOption("HIGH");
    await page.getByLabel("Responsável da solicitação urgente").selectOption(user.id);
    await page.getByLabel("Descrição da solicitação urgente").fill("Validar documento urgente.");
    await page.getByRole("button", { name: "Registrar solicitação" }).click();
    await expect(page.getByText("Validar documento urgente.")).toBeVisible();
    assert.ok(requestLog.some((item) => item.method === "POST" && item.path === "/triagem/urgent-requests"));

    await page.getByRole("button", { name: "Fechar", exact: true }).click();
    await page.getByLabel("Nota de resolução").fill("Documento validado.");
    await page.getByRole("button", { name: "Confirmar fechamento" }).click();
    await expect(page.getByText(/Fechada/)).toBeVisible();
    assert.ok(requestLog.some((item) => item.method === "PATCH" && item.path.endsWith("/close")));

    await page.getByRole("button", { name: "Reabrir", exact: true }).click();
    await expect(page.getByText(/Aberta/)).toBeVisible();
    assert.ok(requestLog.some((item) => item.method === "PATCH" && item.path.endsWith("/reopen")));

    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(JSON.stringify({ url: page.url(), requestCount: requestLog.length, screenshotPath }));
  } finally {
    await browser.close();
  }
}

async function withNextServer(run) {
  if (configuredBaseUrl) {
    await run();
    return;
  }

  const command = process.platform === "win32" ? "cmd" : "corepack";
  const args =
    process.platform === "win32"
      ? ["/c", "corepack", "pnpm", "exec", "next", "start", "--port", port]
      : ["pnpm", "exec", "next", "start", "--port", port];
  const server = spawn(command, args, {
    cwd: appRoot,
    env: smokeEnv,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let output = "";
  server.stdout.on("data", (chunk) => (output += chunk.toString()));
  server.stderr.on("data", (chunk) => (output += chunk.toString()));

  try {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 60_000) {
      if (server.exitCode !== null) {
        throw new Error(`Next production server encerrou antes do smoke.\n${output}`);
      }
      try {
        const response = await fetch(`${baseUrl}/triagem`);
        if (response.ok || response.status < 500) return await run();
      } catch {
        // Continua até o Next abrir a porta.
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`Timeout aguardando o build de produção em ${baseUrl}.\n${output}`);
  } finally {
    stopServer(server);
  }
}

function stopServer(server) {
  if (!server.pid || server.exitCode !== null) return;
  if (process.platform === "win32") {
    execFileSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }
  server.kill("SIGTERM");
}

await withNextServer(runBrowserProof);
console.log("PASS solicitações urgentes preservam competência, fechamento e reabertura");
