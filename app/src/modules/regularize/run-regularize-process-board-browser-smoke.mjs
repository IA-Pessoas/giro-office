import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, expect } from "@playwright/test";

import { browserSmokeEnv } from "../../shared/testing/browserSmokeEnv.mjs";

const PORT = process.env.REGULARIZE_PROCESS_BOARD_BROWSER_PORT || "3129";
const configuredBaseUrl = process.env.REGULARIZE_PROCESS_BOARD_BROWSER_BASE_URL?.replace(/\/$/, "");
const baseUrl = configuredBaseUrl || `http://localhost:${PORT}`;
const appRoot = fileURLToPath(new URL("../../..", import.meta.url));
const repoRoot = path.resolve(appRoot, "..");
const screenshotPath = path.join(repoRoot, "output/playwright/issue-1597/kanban-drag.png");

const processDetail = {
  id: "process-1",
  client_pj_id: "client-1",
  cpf_cnpj: "12345678000199",
  process_type: "Abertura",
  description: "Abrir filial",
  entry_date: "2026-09-01",
  completion_date: null,
  expected_date: "2026-10-15",
  client_notice_date: null,
  status: "Pendente",
  financial_status: "Regular",
  responsible1_id: null,
  responsible2_id: null,
  responsible3_id: null,
  locking_type: null,
  urgency: "Normal",
  task_id: null,
  observation: "Aguardando protocolo",
  clientPJ: { name: "Cliente Kanban", cpf_cnpj: "12345678000199" },
  clientPF: null,
  history: [],
  elapsed_days: 12,
};

const smokeUser = {
  id: "user-regularize-board-smoke",
  name: "Editor Regularize",
  login: "regularize.board.smoke@castelo.test",
  permission: 1,
  organization_id: "org-regularize-board-smoke",
  type: "user",
  modules: { regularize: 2 },
};

async function installApiMocks(page, updates) {
  let persistedProcess = { ...processDetail };
  let failNextUpdate = false;

  await page.route("**/user/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      json: { success: true, data: smokeUser },
    }),
  );
  await page.route("**/client/list**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      json: {
        success: true,
        data: { items: [], total: 0, page: 1, pageSize: 50, hasMore: false },
      },
    }),
  );
  await page.route("**/task/notifications", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      json: { success: true, data: { items: [], unread_count: 0 } },
    }),
  );
  await page.route("**/regularize/dashboard**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      json: {
        success: true,
        data: {
          year: 2026,
          metrics: {
            openProcesses: 1,
            activeLicenses: 0,
            activeClientPfs: 0,
            activeSites: 0,
            municipalTaxesCompleted: 0,
            municipalTaxesPending: 0,
            municipalTaxesTotal: 0,
          },
          recentProcesses: [],
          trackedLicenses: [],
        },
      },
    }),
  );
  await page.route("**/regularize/guidance/list**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      json: { success: true, data: [] },
    }),
  );
  await page.route("**/regularize/pfs**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      json: {
        success: true,
        data: { data: [], total: 0, page: 1, limit: 20, hasMore: false },
      },
    }),
  );
  await page.route("**/regularize/process**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;

    if (pathname.endsWith("/regularize/processes")) {
      const searchParams = new URL(request.url()).searchParams;
      const isPaginated = searchParams.has("page") || searchParams.has("limit");
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        json: {
          success: true,
          data: isPaginated
            ? {
                data: [{ ...persistedProcess }],
                total: 1,
                page: 1,
                limit: 20,
                hasMore: false,
              }
            : [{ ...persistedProcess }],
        },
      });
    }

    if (request.method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        json: { success: true, data: { ...persistedProcess } },
      });
    }

    assert.equal(request.method(), "PUT");
    const payload = request.postDataJSON();
    updates.push(payload);
    if (failNextUpdate) {
      failNextUpdate = false;
      return route.fulfill({
        status: 409,
        contentType: "application/json",
        json: {
          success: false,
          error: "Processo foi alterado; recarregue e tente novamente.",
        },
      });
    }

    persistedProcess = { ...persistedProcess, ...payload };
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      json: { success: true, data: { ...persistedProcess } },
    });
  });

  return {
    failNextUpdate() {
      failNextUpdate = true;
    },
    getPersistedStatus() {
      return persistedProcess.status;
    },
  };
}

async function runBrowserProof() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    baseURL: baseUrl,
    viewport: { width: 1440, height: 900 },
  });
  await context.addCookies([
    {
      name: "cw.session",
      value: "opaque-test-session",
      url: baseUrl,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const page = await context.newPage();
  const updates = [];
  const apiRequests = [];
  const failedResponses = [];
  page.on("request", (request) => {
    if (/\/user\/me|\/regularize\//.test(request.url())) {
      apiRequests.push(`${request.method()} ${request.url()}`);
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      failedResponses.push(`${response.status()} ${response.url()}`);
    }
  });
  const api = await installApiMocks(page, updates);

  try {
    await page.goto("/regularize", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Processos", exact: true }).click();
    await page.getByRole("button", { name: "Quadro", exact: true }).click();

    const card = page.locator("article").filter({ hasText: "Abertura" });
    const protocolado = page.getByRole("region", { name: "Protocolado" });
    await expect(card).toHaveCount(1);
    await card.dragTo(protocolado);
    await expect(protocolado.locator("article").filter({ hasText: "Abertura" })).toHaveCount(1);
    await expect.poll(() => updates.length).toBe(1);
    assert.equal(updates[0].status, "Protocolado");
    assert.equal(updates[0].description, processDetail.description);
    assert.equal(updates[0].client_pj_id, processDetail.client_pj_id);
    assert.equal(api.getPersistedStatus(), "Protocolado");
    assert.deepEqual(failedResponses, [], "The successful move should not surface unrelated API failures.");

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Processos", exact: true }).click();
    await page.getByRole("button", { name: "Quadro", exact: true }).click();
    const reloadedProtocolado = page.getByRole("region", { name: "Protocolado" });
    await expect(reloadedProtocolado.locator("article").filter({ hasText: "Abertura" })).toHaveCount(1);
    assert.equal(api.getPersistedStatus(), "Protocolado");

    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Evidência do quadro: ${screenshotPath}`);

    api.failNextUpdate();
    await page
      .getByRole("combobox", { name: "Mover Abertura para outro status" })
      .selectOption("Finalizado");
    await expect.poll(() => updates.length).toBe(2);
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Processo foi alterado; recarregue e tente novamente." }),
    ).toBeVisible();
    await expect(protocolado.locator("article").filter({ hasText: "Abertura" })).toHaveCount(1);
    await expect(page.getByRole("region", { name: "Finalizado" }).locator("article")).toHaveCount(0);

    smokeUser.modules.regularize = 1;
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Processos", exact: true }).click();
    await page.getByRole("button", { name: "Quadro", exact: true }).click();
    const readOnlyCard = page.locator("article").filter({ hasText: "Abertura" });
    await expect(readOnlyCard).toHaveCount(1);
    await expect(page.getByRole("combobox", { name: "Mover Abertura para outro status" })).toHaveCount(0);
    assert.equal(await readOnlyCard.evaluate((element) => element.draggable), false);
  } catch (error) {
    console.error(`URL: ${page.url()}`);
    console.error(`Texto da página: ${(await page.locator("body").innerText()).slice(0, 1000)}`);
    console.error(`Requisições: ${apiRequests.join("\n")}`);
    console.error(`Respostas com erro: ${failedResponses.join("\n")}`);
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}

async function withNextServer(run) {
  if (configuredBaseUrl) return run();
  const nextCli = createRequire(import.meta.url).resolve("next/dist/bin/next");
  const server = spawn(process.execPath, [nextCli, "dev", "--webpack", "--port", PORT], {
    cwd: appRoot,
    env: browserSmokeEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  server.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });
  try {
    const startedAt = Date.now();
    let ready = false;
    while (Date.now() - startedAt < 45_000) {
      if (server.exitCode !== null) throw new Error(`Next encerrou antes do smoke.\n${output}`);
      try {
        const response = await fetch(baseUrl);
        if (response.ok || response.status < 500) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!ready) throw new Error(`Tempo esgotado aguardando Next em ${baseUrl}.\n${output}`);
    const response = await fetch(`${baseUrl}/regularize`, {
      headers: { Cookie: "cw.session=opaque-test-session" },
      signal: AbortSignal.timeout(120_000),
    });
    assert.equal(response.status, 200, "Next must serve /regularize before the smoke.");
    await run();
  } finally {
    if (server.pid && server.exitCode === null) {
      if (process.platform === "win32") {
        execFileSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        server.kill("SIGTERM");
      }
    }
  }
}

await mkdir(path.dirname(screenshotPath), { recursive: true });
await withNextServer(runBrowserProof);
console.log("PASS Regularize permite arrastar processos, persistir status e reverter falhas");
